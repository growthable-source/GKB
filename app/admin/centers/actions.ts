'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { authorize } from '@/lib/authz/authorize'
import { createBrandedHelpCenter } from '@/lib/tenancy/create-center'
import { DEFAULT_PRIMARY_HEX, DEFAULT_SECONDARY_HEX } from '@/lib/tenancy/color'

export type CreateHelpCenterState = { error?: string }

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
    })
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Could not create help center.' }
  }

  revalidatePath('/admin/centers')
  redirect(`/admin/centers?created=${created.slug}`)
}
