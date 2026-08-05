'use server'

import { revalidatePath, updateTag } from 'next/cache'
import { BRAND_TAG } from '@/lib/cache/tags'
import { authorize } from '@/lib/authz/authorize'
import { updateHelpCenter } from '@/lib/tenancy/update-center'
import { readAppearanceForm } from '@/lib/tenancy/appearance'
import { DEFAULT_PRIMARY_HEX, DEFAULT_SECONDARY_HEX } from '@/lib/tenancy/color'
import { getOwnedCenter } from '@/lib/dashboard/owned-center'

export type DashboardState = { error?: string; saved?: boolean }

/**
 * Saves branding for the center the caller owns.
 *
 * A sibling of app/admin/centers/actions.ts rather than a reuse of it. That one
 * authorizes with an empty resource, which is right for global staff and wrong
 * here — this passes the owned center's id, so an editor is allowed exactly one
 * center and no other.
 */
export async function saveBranding(
  _prev: DashboardState | null,
  formData: FormData,
): Promise<DashboardState> {
  const center = await getOwnedCenter()
  if (!center) return { error: 'You do not have a help centre yet.' }

  await authorize('helpCenter.update', { helpCenterId: center.id })

  const text = (key: string) => String(formData.get(key) ?? '').trim()

  try {
    await updateHelpCenter({
      id: center.id,
      name: text('name') || center.name,
      // The address is changed on its own screen, not folded into a branding
      // save — a slug change breaks every link anyone has already shared.
      slug: center.slug,
      primaryHex: text('primaryHex') || DEFAULT_PRIMARY_HEX,
      secondaryHex: text('secondaryHex') || DEFAULT_SECONDARY_HEX,
      logoUrl: text('logoUrl') || undefined,
      faviconUrl: text('faviconUrl') || undefined,
      headline: text('headline') || undefined,
      subtitle: text('subtitle') || undefined,
      ...readAppearanceForm(formData),
    })
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Could not save your changes.' }
  }

  updateTag(BRAND_TAG)
  revalidatePath('/dashboard')
  revalidatePath(`/hc/${center.slug}`, 'layout')
  return { saved: true }
}
