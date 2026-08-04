'use server'

import { revalidatePath, updateTag } from 'next/cache'
import { redirect } from 'next/navigation'
import { BRAND_TAG } from '@/lib/cache/tags'
import { authorize } from '@/lib/authz/authorize'
import { createBrandedHelpCenter } from '@/lib/tenancy/create-center'
import { updateHelpCenter } from '@/lib/tenancy/update-center'
import { readAppearanceForm } from '@/lib/tenancy/appearance'
import { DEFAULT_PRIMARY_HEX, DEFAULT_SECONDARY_HEX } from '@/lib/tenancy/color'

export type CreateHelpCenterState = { error?: string }
export type EditHelpCenterState = { error?: string; saved?: boolean }

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
