'use server'

import { revalidatePath, updateTag } from 'next/cache'
import { redirect } from 'next/navigation'
import { BRAND_TAG } from '@/lib/cache/tags'
import { authorize } from '@/lib/authz/authorize'
import { serviceClient } from '@/lib/db/client'
import { createBrandedHelpCenter } from '@/lib/tenancy/create-center'
import { updateHelpCenter } from '@/lib/tenancy/update-center'
import { readAppearanceForm } from '@/lib/tenancy/appearance'
import { DEFAULT_PRIMARY_HEX, DEFAULT_SECONDARY_HEX } from '@/lib/tenancy/color'
import { isXoveraConfigured, cancelInstall, setPartnerPlan, XoveraError } from '@/lib/ai-widget/client'
import { externalIdFor } from '@/lib/ai-widget/external-id'
import { isVercelDomainsConfigured, removeDomainFromVercel, VercelDomainError } from '@/lib/domains/vercel'

export type CreateHelpCenterState = { error?: string }
export type EditHelpCenterState = { error?: string; saved?: boolean }
export type DeleteHelpCenterState = { error?: string }

export async function createHelpCenter(
  _prev: CreateHelpCenterState | null,
  formData: FormData,
): Promise<CreateHelpCenterState> {
  await authorize('helpCenter.create', {})

  const name = String(formData.get('name') ?? '').trim()
  if (!name) return { error: 'Name is required.' }

  const slug = String(formData.get('slug') ?? '').trim()
  if (!slug) return { error: 'Slug is required.' }

  const primaryHex = String(formData.get('primaryHex') ?? '').trim() || DEFAULT_PRIMARY_HEX
  const secondaryHex = String(formData.get('secondaryHex') ?? '').trim() || DEFAULT_SECONDARY_HEX
  const logoUrl = String(formData.get('logoUrl') ?? '').trim() || undefined
  const faviconUrl = String(formData.get('faviconUrl') ?? '').trim() || undefined
  const headline = String(formData.get('headline') ?? '').trim() || undefined
  const subtitle = String(formData.get('subtitle') ?? '').trim() || undefined

  let created
  try {
    created = await createBrandedHelpCenter({
      name,
      slug,
      primaryHex,
      secondaryHex,
      logoUrl,
      faviconUrl,
      headline,
      subtitle,
      ...readAppearanceForm(formData),
    })
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Could not create help center.' }
  }

  // Host/slug -> help center resolution is cached (lib/tenancy/active.ts); a new
  // center must be previewable now, not after the TTL. Before redirect(), which
  // throws.
  updateTag(BRAND_TAG)
  revalidatePath('/admin/centers')
  redirect(`/admin/centers?created=${created.slug}`)
}

export async function editHelpCenter(
  _prev: EditHelpCenterState | null,
  formData: FormData,
): Promise<EditHelpCenterState> {
  await authorize('helpCenter.update', {})

  const id = String(formData.get('id') ?? '')
  if (!id) return { error: 'Missing help center id.' }

  const text = (key: string) => String(formData.get(key) ?? '').trim()

  try {
    await updateHelpCenter({
      id,
      name: text('name'),
      slug: text('slug'),
      primaryHex: text('primaryHex') || DEFAULT_PRIMARY_HEX,
      secondaryHex: text('secondaryHex') || DEFAULT_SECONDARY_HEX,
      logoUrl: text('logoUrl') || undefined,
      faviconUrl: text('faviconUrl') || undefined,
      headline: text('headline') || undefined,
      subtitle: text('subtitle') || undefined,
      ...readAppearanceForm(formData),
    })
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Could not save help center.' }
  }

  // Brand resolution is cached by hostname and slug (lib/tenancy/active.ts), so
  // a rename or a colour change is invisible until this tag is busted.
  updateTag(BRAND_TAG)
  revalidatePath('/admin/centers')
  revalidatePath('/', 'layout')
  return { saved: true }
}

export type SyncCenterState = { error?: string; ok?: string }

/**
 * Staff fallback for the automatic post-unlock push: pulls Xovera's
 * install + plan state into this centre right now. Harmless to click
 * any time — both halves are idempotent.
 */
export async function syncCenterFromXovera(
  _prev: SyncCenterState | null,
  formData: FormData,
): Promise<SyncCenterState> {
  await authorize('helpCenter.update', {})

  const id = String(formData.get('id') ?? '')
  if (!id) return { error: 'Missing help center id.' }
  if (!isXoveraConfigured()) return { error: 'Xovera is not configured on this environment.' }

  const { syncCenterWithXovera } = await import('@/lib/ai-widget/reconcile')
  const result = await syncCenterWithXovera(id)
  revalidatePath(`/admin/centers/${id}`)
  return {
    ok: result.recovered
      ? 'Widget install recovered from Xovera — it will appear on the centre within 30 seconds.'
      : result.refreshed
        ? 'Synced — plan and install state refreshed from Xovera.'
        : 'Nothing to sync — Xovera has no install for this centre yet.',
  }
}

/**
 * Hard-deletes a help centre. Admin-area only (owner + staff), and the
 * form requires the centre's slug typed back exactly — deleting the
 * wrong tenant is the single most destructive mistake this admin can
 * make, and a modal "Are you sure?" is muscle-memory by now.
 *
 * Order matters — every external detach happens BEFORE the local row
 * (and its FK cascades) are gone, because the row is what tells us the
 * hostnames and the install to detach:
 *  1. Xovera — cancel the plan and deactivate the widget. `not_ready`
 *     is tolerated (a registered-but-never-provisioned install has no
 *     workspace to cancel — that's fine, nothing is billing).
 *  2. Vercel — detach every custom domain, or the dead tenant's
 *     hostname keeps routing into this app and serving its content
 *     (the FK cascade drops the DB row but never calls Vercel).
 *  3. Storage — logo/favicon in the shared article-media bucket, but
 *     ONLY objects that live in our bucket and aren't referenced by
 *     another centre (logo_url is free text; a shared URL must not take
 *     a live centre's image down with it).
 *  4. The help_centers row — FK cascades take memberships, placements,
 *     tenant articles/collections, custom domains, invites, the
 *     ai_widget_installs cache row, and search rows.
 *  5. Bust the brand cache so the dead centre stops resolving.
 *
 * Deliberately NOT touched: an agency_subscriptions row detaches
 * (SET NULL) but is not cancelled — Stripe billing is money, staff
 * confirm that by hand; the confirm panel warns when one is active.
 */
export async function deleteHelpCenter(
  _prev: DeleteHelpCenterState | null,
  formData: FormData,
): Promise<DeleteHelpCenterState> {
  await authorize('helpCenter.delete', {})

  const id = String(formData.get('id') ?? '')
  const confirmSlug = String(formData.get('confirmSlug') ?? '').trim()
  if (!id) return { error: 'Missing help center id.' }

  const db = serviceClient()
  const { data: center, error } = await db
    .from('help_centers')
    .select('id, slug, name, is_base, logo_url, favicon_url')
    .eq('id', id)
    .maybeSingle()
  if (error) return { error: `Could not load the help centre: ${error.message}` }
  if (!center) return { error: 'Help centre not found.' }
  if (center.is_base) return { error: 'The base centre owns the shared library and cannot be deleted.' }
  if (confirmSlug !== center.slug) {
    return { error: `Type the slug exactly ("${center.slug}") to confirm deletion.` }
  }

  // Does this centre have a widget install to deactivate? If it does
  // and Xovera isn't configured here, ABORT rather than cascade-drop
  // the only local pointer to a possibly-billed live workspace.
  const { data: install } = await db
    .from('ai_widget_installs')
    .select('help_center_id')
    .eq('help_center_id', center.id)
    .maybeSingle()

  // 1. Xovera. `not_ready` = a registered install with no workspace yet
  // (nothing to cancel); `not_found` = never provisioned. Both fine.
  if (isXoveraConfigured()) {
    const externalId = externalIdFor(center.id)
    for (const step of [
      () => setPartnerPlan(externalId, 'canceled'),
      () => cancelInstall(externalId),
    ]) {
      try {
        await step()
      } catch (err) {
        const tolerable = err instanceof XoveraError && (err.code === 'not_found' || err.code === 'not_ready')
        if (!tolerable) {
          const detail = err instanceof Error ? err.message : String(err)
          return { error: `Could not deactivate the AI widget on Xovera: ${detail}. Nothing was deleted — try again.` }
        }
      }
    }
  } else if (install) {
    return {
      error: 'This centre has an AI widget but Xovera is not configured on this environment — deleting now would strand a live widget. Deploy with XOVERA_API_KEY set, or remove the widget first.',
    }
  }

  // 2. Vercel — detach every custom domain before the row (and its
  // hostnames) disappear.
  const { data: domains } = await db
    .from('custom_domains')
    .select('hostname')
    .eq('help_center_id', center.id)
  if (isVercelDomainsConfigured()) {
    for (const d of domains ?? []) {
      try {
        await removeDomainFromVercel(d.hostname)
      } catch (err) {
        if (!(err instanceof VercelDomainError && err.status === 404)) {
          const detail = err instanceof Error ? err.message : String(err)
          return { error: `Could not detach the custom domain ${d.hostname} from Vercel: ${detail}. Nothing was deleted — try again.` }
        }
      }
    }
  } else if ((domains ?? []).length > 0) {
    return {
      error: 'This centre has a custom domain but Vercel is not configured here — deleting would leave the hostname attached and serving. Configure Vercel domains, or remove the domain first.',
    }
  }

  // 3. Storage — only our own bucket, and only objects no other centre
  // still references (logo_url is free text and can be shared/external).
  const supabaseHost = (() => { try { return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').host } catch { return '' } })()
  const candidateNames: string[] = []
  for (const url of [center.logo_url, center.favicon_url]) {
    if (!url) continue
    let parsed: URL
    try { parsed = new URL(url) } catch { continue }
    if (!supabaseHost || parsed.host !== supabaseHost) continue // external URL — not ours to delete
    if (!parsed.pathname.includes('/article-media/')) continue
    // Referenced by another live centre? Then it's shared — leave it.
    const { count } = await db
      .from('help_centers')
      .select('id', { count: 'exact', head: true })
      .neq('id', center.id)
      .or(`logo_url.eq.${url},favicon_url.eq.${url}`)
    if ((count ?? 0) > 0) continue
    const name = decodeURIComponent(parsed.pathname.split('/').pop() ?? '')
    if (name) candidateNames.push(name)
  }
  if (candidateNames.length > 0) {
    await db.storage.from('article-media').remove(candidateNames).catch(() => {})
  }

  // 4. The row — cascades do the rest.
  const { error: deleteError } = await db.from('help_centers').delete().eq('id', id)
  if (deleteError) return { error: `Delete failed: ${deleteError.message}` }

  // 5. Cache. Without this the dead centre keeps resolving until TTL.
  updateTag(BRAND_TAG)
  revalidatePath('/admin/centers')
  console.log(`[admin] help centre deleted: ${center.slug} (${center.id})`)
  redirect(`/admin/centers?deleted=${center.slug}`)
}
