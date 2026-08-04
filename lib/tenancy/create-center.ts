import { serviceClient } from '@/lib/db/client'
import { slugify } from '@/lib/content/slug'
import { assertHex } from '@/lib/tenancy/color'
import { RESERVED_SLUGS } from './reserved-slugs'
import { toAppearanceColumns, type AppearanceInput } from './appearance'

export type CreateHelpCenterInput = Partial<AppearanceInput> & {
  name: string
  slug: string
  primaryHex: string
  secondaryHex: string
  logoUrl?: string | null
  faviconUrl?: string | null
  headline?: string
  subtitle?: string
}

export type CreatedHelpCenter = { id: string; slug: string }

/**
 * Creates a new BRANDED help center. It starts with no content of its own —
 * it will render the exact same collections and articles as every other
 * center, differing only in name, colors, logo, favicon, and domain. There is
 * no copy step because there is nothing to copy: all centers read through the
 * base center's shared placement and search rows (see
 * lib/tenancy/active.ts's getBaseHelpCenterId).
 */
export async function createBrandedHelpCenter(input: CreateHelpCenterInput): Promise<CreatedHelpCenter> {
  const slug = slugify(input.slug)
  if (RESERVED_SLUGS.has(slug)) {
    throw new Error(`"${slug}" is a reserved slug and cannot be used for a help center.`)
  }

  assertHex(input.primaryHex, 'Primary color')
  assertHex(input.secondaryHex, 'Secondary color')

  const appearance = toAppearanceColumns(input)
  const db = serviceClient()

  const { data: existing, error: existingError } = await db
    .from('help_centers')
    .select('id')
    .eq('slug', slug)
    .maybeSingle()
  if (existingError) {
    throw new Error(`Could not check slug availability: ${existingError.message}`)
  }
  if (existing) throw new Error(`The slug "${slug}" is already in use.`)

  // Recorded as lineage metadata only — no content is copied from it.
  const { data: base, error: baseError } = await db
    .from('help_centers')
    .select('id')
    .eq('is_base', true)
    .single()
  if (baseError || !base) {
    throw new Error(`No base help center found: ${baseError?.message ?? 'missing row'}`)
  }

  const settings: { headline?: string; subtitle?: string } = {}
  if (input.headline) settings.headline = input.headline
  if (input.subtitle) settings.subtitle = input.subtitle

  const { data: created, error: createError } = await db
    .from('help_centers')
    .insert({
      name: input.name,
      slug,
      is_base: false,
      cloned_from_id: base.id,
      primary_hex: input.primaryHex,
      secondary_hex: input.secondaryHex,
      logo_url: input.logoUrl || null,
      favicon_url: input.faviconUrl || null,
      visibility: 'public',
      auto_include_new_articles: true,
      settings,
      ...appearance,
    })
    .select('id, slug')
    .single()
  if (createError || !created) {
    throw new Error(`Could not create help center: ${createError?.message}`)
  }

  return { id: created.id, slug: created.slug }
}
