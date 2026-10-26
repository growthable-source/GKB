'use server'

import { updateTag } from 'next/cache'
import { revalidatePath } from 'next/cache'
import { BRAND_TAG } from '@/lib/cache/tags'
import { serviceClient } from '@/lib/db/client'
import { authorize, currentActor } from '@/lib/authz/authorize'
import { getOwnedCenter } from '@/lib/dashboard/owned-center'
import { centreOwnerUserId } from '@/lib/dashboard/centre-owner'
import {
  addDomainToVercel,
  getDomainStatus,
  isVercelDomainsConfigured,
  removeDomainFromVercel,
} from '@/lib/domains/vercel'
import { reportDomainFailure } from '@/lib/domains/messages'
import {
  hostnameHasOwnershipTxt,
  newOwnershipToken,
} from '@/lib/domains/ownership'
import { liveHostnameOwner, shouldDetachHostname } from '@/lib/domains/lifecycle'

/**
 * Custom domain management — a Pro feature.
 *
 * One domain per centre. Lifecycle: pending (ownership TXT issued, not
 * attached) → verifying (TXT proven, attached, waiting on routing DNS)
 * → active (Vercel confirms routing, brand cache busted, traffic serves).
 * Pending rows do not lock the hostname for other centres and are not
 * attached to the shared Vercel project.
 */

const HOSTNAME_RE = /^(?=.{4,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/
// Never let a customer claim our own infrastructure hostnames.
const RESERVED_SUFFIXES = ['growthable.io', 'xovera.io', 'vercel.app']

export type DomainActionState = { error?: string; ok?: string }

type DomainRow = {
  id: string
  hostname: string
  status: string
  ownership_token: string | null
}

async function requireProCenter(): Promise<{ centerId: string } | { error: string }> {
  const center = await getOwnedCenter()
  if (!center) return { error: 'No help centre on this account.' }
  if (center.plan !== 'pro') return { error: 'Custom domains are a Pro feature.' }
  await authorize('helpCenter.update', { helpCenterId: center.id })
  // The domain is the centre's public identity — only the owner changes
  // it, not every invited editor.
  const actor = await currentActor()
  const ownerId = await centreOwnerUserId(center.id)
  if (!ownerId || ownerId !== actor.userId) {
    return { error: 'Only the help centre owner can manage the custom domain.' }
  }
  return { centerId: center.id }
}

export async function addCustomDomain(
  _prev: DomainActionState | null,
  formData: FormData,
): Promise<DomainActionState> {
  const gate = await requireProCenter()
  if ('error' in gate) return { error: gate.error }
  if (!isVercelDomainsConfigured()) {
    return { error: 'Custom domains are not configured on this environment yet.' }
  }

  const hostname = String(formData.get('hostname') ?? '').trim().toLowerCase().replace(/\.$/, '')
  if (!HOSTNAME_RE.test(hostname)) {
    return { error: 'Enter a full hostname like help.youragency.com.' }
  }
  if (RESERVED_SUFFIXES.some((s) => hostname === s || hostname.endsWith(`.${s}`))) {
    return { error: 'That domain is reserved.' }
  }

  const db = serviceClient()
  const live = await liveHostnameOwner(hostname)
  if (live && live !== gate.centerId) {
    return { error: 'That hostname is already in use by another help centre.' }
  }

  const { data: mine } = await db
    .from('custom_domains')
    .select('id, hostname, status, ownership_token')
    .eq('help_center_id', gate.centerId)
    .maybeSingle<DomainRow>()
  if (mine?.status === 'active') {
    return { error: 'Remove the current domain before adding a new one.' }
  }

  const token = newOwnershipToken()
  const { error: upsertError } = await db.from('custom_domains').upsert(
    {
      help_center_id: gate.centerId,
      hostname,
      status: 'pending',
      ownership_token: token,
      verified_at: null,
    },
    { onConflict: 'help_center_id' },
  )
  if (upsertError) return { error: `Could not save the domain: ${upsertError.message}` }

  revalidatePath('/dashboard/domain')
  return { ok: 'Domain saved — add the TXT record below to prove you control it, then check again.' }
}

export async function checkCustomDomain(): Promise<DomainActionState> {
  const gate = await requireProCenter()
  if ('error' in gate) return { error: gate.error }
  if (!isVercelDomainsConfigured()) {
    return { error: 'Custom domains are not configured on this environment yet.' }
  }

  const db = serviceClient()
  const { data: row } = await db
    .from('custom_domains')
    .select('id, hostname, status, ownership_token')
    .eq('help_center_id', gate.centerId)
    .maybeSingle<DomainRow>()
  if (!row) return { error: 'No domain to check.' }

  const live = await liveHostnameOwner(row.hostname)
  if (live && live !== gate.centerId) {
    await db.from('custom_domains').update({ status: 'failed' }).eq('id', row.id)
    revalidatePath('/dashboard/domain')
    return { error: 'That hostname is already in use by another help centre.' }
  }

  let token = row.ownership_token
  if (!token) {
    token = newOwnershipToken()
    await db.from('custom_domains').update({ ownership_token: token, status: 'pending' }).eq('id', row.id)
    revalidatePath('/dashboard/domain')
    return { ok: 'Add the TXT record below to prove you control this domain, then check again.' }
  }

  const owns = await hostnameHasOwnershipTxt(row.hostname, token)
  if (!owns) {
    revalidatePath('/dashboard/domain')
    return { ok: 'We cannot see the ownership TXT record yet. Create it, wait a minute, and check again.' }
  }

  if (row.status === 'pending') {
    try {
      await addDomainToVercel(row.hostname)
    } catch (err) {
      return { error: reportDomainFailure(err, 'attach', row.hostname) }
    }
    await db.from('custom_domains').update({ status: 'verifying' }).eq('id', row.id)
    row.status = 'verifying'
  }

  let status
  try {
    status = await getDomainStatus(row.hostname)
  } catch (err) {
    return { error: reportDomainFailure(err, 'check', row.hostname) }
  }

  if (status.verified && !status.misconfigured) {
    const { error: activateError } = await db
      .from('custom_domains')
      .update({ status: 'active', verified_at: new Date().toISOString() })
      .eq('id', row.id)
    if (activateError) {
      await db.from('custom_domains').update({ status: 'failed' }).eq('id', row.id)
      revalidatePath('/dashboard/domain')
      return { error: 'That hostname is already in use by another help centre.' }
    }
    await db
      .from('custom_domains')
      .update({ status: 'failed' })
      .eq('hostname', row.hostname)
      .neq('id', row.id)
    updateTag(BRAND_TAG)
    revalidatePath('/dashboard/domain')
    return { ok: 'Your domain is live. 🎉' }
  }

  if (row.status !== 'verifying') {
    await db.from('custom_domains').update({ status: 'verifying' }).eq('id', row.id)
  }
  revalidatePath('/dashboard/domain')
  return { ok: 'Ownership is proven — now point the hostname at us using the records below, then check again.' }
}

export async function removeCustomDomain(): Promise<DomainActionState> {
  const gate = await requireProCenter()
  if ('error' in gate) return { error: gate.error }

  const db = serviceClient()
  const { data: row } = await db
    .from('custom_domains')
    .select('id, hostname, status, ownership_token')
    .eq('help_center_id', gate.centerId)
    .maybeSingle<DomainRow>()
  if (!row) return { error: 'No domain to remove.' }

  if (isVercelDomainsConfigured() && (await shouldDetachHostname(row.hostname, gate.centerId, row.status))) {
    try {
      await removeDomainFromVercel(row.hostname)
    } catch (err) {
      return { error: reportDomainFailure(err, 'detach', row.hostname) }
    }
  }

  await db.from('custom_domains').delete().eq('id', row.id)
  updateTag(BRAND_TAG)
  revalidatePath('/dashboard/domain')
  return { ok: 'Domain removed — your help centre is back on its Growthable address.' }
}
