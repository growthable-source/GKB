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
  VercelDomainError,
} from '@/lib/domains/vercel'

/**
 * Custom domain management — a Pro feature.
 *
 * One domain per centre (the table allows more; the UI deliberately
 * doesn't). Lifecycle: pending (row written, Vercel attach in flight)
 * → verifying (attached, waiting on the customer's DNS) → active
 * (Vercel confirms, brand cache busted, traffic serves). The status
 * check is customer-driven — a "Check again" button beats a cron for
 * a thing the customer is actively watching.
 */

const HOSTNAME_RE = /^(?=.{4,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/
// Never let a customer claim our own infrastructure hostnames.
const RESERVED_SUFFIXES = ['growthable.io', 'xovera.io', 'vercel.app']

export type DomainActionState = { error?: string; ok?: string }

/**
 * Vercel's own wording is right for things the customer can act on (a
 * hostname another account already claimed). Credential failures are
 * ours — telling someone staring at their DNS panel "Not authorized"
 * sends them hunting for a problem that isn't theirs.
 */
function domainErrorMessage(err: unknown, verb: 'attach' | 'check' | 'detach'): string {
  if (err instanceof VercelDomainError && err.isCredentialProblem) {
    return 'Custom domains are not set up correctly on this environment — our hosting credentials were rejected. Nothing to fix on your side; please contact support.'
  }
  const detail = err instanceof VercelDomainError ? err.message : String(err)
  return `Could not ${verb} the domain: ${detail}`
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

  const { data: existing } = await db
    .from('custom_domains')
    .select('help_center_id, status')
    .eq('hostname', hostname)
    .maybeSingle()
  if (existing && existing.help_center_id !== gate.centerId) {
    return { error: 'That hostname is already in use by another help centre.' }
  }

  // Row first, so a Vercel timeout leaves a visible pending row to
  // retry from rather than an attach nobody remembers.
  const { error: upsertError } = await db.from('custom_domains').upsert(
    { help_center_id: gate.centerId, hostname, status: 'pending' },
    { onConflict: 'hostname' },
  )
  if (upsertError) return { error: `Could not save the domain: ${upsertError.message}` }

  try {
    await addDomainToVercel(hostname)
  } catch (err) {
    // A definitive HTTP rejection means the attach did NOT happen, so the
    // pending row above is a lie — and worse, it holds the hostname
    // against every other centre (see the conflict check). Undo it,
    // restoring any state this row had before. A transport failure
    // (status null) leaves the outcome genuinely unknown, so that row
    // stays put to be retried, which is what it's there for.
    if (err instanceof VercelDomainError && err.status !== null) {
      if (existing) {
        await db.from('custom_domains').update({ status: existing.status }).eq('hostname', hostname)
      } else {
        await db.from('custom_domains').delete().eq('hostname', hostname)
      }
    }
    return { error: domainErrorMessage(err, 'attach') }
  }

  await db.from('custom_domains').update({ status: 'verifying' }).eq('hostname', hostname)
  revalidatePath('/dashboard/domain')
  return { ok: 'Domain added — now point your DNS at us using the records below.' }
}

// Fewer params than useActionState passes — fine, TS/JS both allow it,
// and it spares the unused-vars dance.
export async function checkCustomDomain(): Promise<DomainActionState> {
  const gate = await requireProCenter()
  if ('error' in gate) return { error: gate.error }
  if (!isVercelDomainsConfigured()) {
    return { error: 'Custom domains are not configured on this environment yet.' }
  }

  const db = serviceClient()
  const { data: row } = await db
    .from('custom_domains')
    .select('hostname, status')
    .eq('help_center_id', gate.centerId)
    .maybeSingle()
  if (!row) return { error: 'No domain to check.' }

  let status
  try {
    status = await getDomainStatus(row.hostname)
  } catch (err) {
    return { error: domainErrorMessage(err, 'check') }
  }

  if (status.verified && !status.misconfigured) {
    await db
      .from('custom_domains')
      .update({ status: 'active', verified_at: new Date().toISOString() })
      .eq('hostname', row.hostname)
    // Hostname → centre resolution is cached; without this the new
    // domain 404s until the brand TTL rolls over.
    updateTag(BRAND_TAG)
    revalidatePath('/dashboard/domain')
    return { ok: 'Your domain is live. 🎉' }
  }

  if (row.status !== 'verifying') {
    await db.from('custom_domains').update({ status: 'verifying' }).eq('hostname', row.hostname)
  }
  revalidatePath('/dashboard/domain')
  return { ok: 'Not verified yet — DNS changes can take a few minutes to propagate. Check the records below and try again.' }
}

export async function removeCustomDomain(): Promise<DomainActionState> {
  const gate = await requireProCenter()
  if ('error' in gate) return { error: gate.error }

  const db = serviceClient()
  const { data: row } = await db
    .from('custom_domains')
    .select('hostname')
    .eq('help_center_id', gate.centerId)
    .maybeSingle()
  if (!row) return { error: 'No domain to remove.' }

  if (isVercelDomainsConfigured()) {
    try {
      await removeDomainFromVercel(row.hostname)
    } catch (err) {
      return { error: domainErrorMessage(err, 'detach') }
    }
  }

  await db.from('custom_domains').delete().eq('hostname', row.hostname)
  updateTag(BRAND_TAG)
  revalidatePath('/dashboard/domain')
  return { ok: 'Domain removed — your help centre is back on its Growthable address.' }
}
