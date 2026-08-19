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

/**
 * Hard-deletes a help centre. Admin-area only (owner + staff), and the
 * form requires the centre's slug typed back exactly — deleting the
 * wrong tenant is the single most destructive mistake this admin can
 * make, and a modal "Are you sure?" is muscle-memory by now.
 *
 * Order matters:
 *  1. Xovera first — cancel the plan (widget drops to expired-trial
 *     behaviour) and deactivate the widget. Their side keeps the
 *     workspace soft-disabled, so this is the recoverable half.
 *  2. Storage — logo/favicon live as bare uuid names in the shared
 *     article-media bucket with no per-centre prefix; delete by the
 *     URLs on the row now or they orphan forever.
 *  3. The help_centers row — FK cascades take memberships, placements,
 *     tenant articles/collections, custom domains, invites, the
 *     ai_widget_installs cache row, and search rows.
 *  4. Bust the brand cache so the dead centre stops resolving.
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

  // 1. Xovera — both calls tolerate an install that never existed.
  if (isXoveraConfigured()) {
    const externalId = externalIdFor(center.id)
    for (const step of [
      () => setPartnerPlan(externalId, 'canceled'),
      () => cancelInstall(externalId),
    ]) {
      try {
        await step()
      } catch (err) {
        if (!(err instanceof XoveraError && err.code === 'not_found')) {
          // A live widget that keeps answering for a deleted centre is
          // worse than aborting the delete — stop and let staff retry.
          const detail = err instanceof Error ? err.message : String(err)
          return { error: `Could not deactivate the AI widget on Xovera: ${detail}. Nothing was deleted — try again.` }
        }
      }
    }
  }

  // 2. Storage. Best-effort: an orphaned logo is not worth failing over.
  const names = [center.logo_url, center.favicon_url]
    .filter((u): u is string => !!u)
    .map((u) => { try { return decodeURIComponent(new URL(u).pathname.split('/').pop() ?? '') } catch { return '' } })
    .filter(Boolean)
  if (names.length > 0) {
    await db.storage.from('article-media').remove(names).catch(() => {})
  }

  // 3. The row — cascades do the rest.
  const { error: deleteError } = await db.from('help_centers').delete().eq('id', id)
  if (deleteError) return { error: `Delete failed: ${deleteError.message}` }

  // 4. Cache. Without this the dead centre keeps resolving until TTL.
  updateTag(BRAND_TAG)
  revalidatePath('/admin/centers')
  console.log(`[admin] help centre deleted: ${center.slug} (${center.id})`)
  redirect(`/admin/centers?deleted=${center.slug}`)
}
