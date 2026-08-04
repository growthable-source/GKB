import { serviceClient } from '@/lib/db/client'
import { slugify } from '@/lib/content/slug'
import { assertHex } from './color'
import { RESERVED_SLUGS } from './reserved-slugs'
import { toAppearanceColumns, type AppearanceInput } from './appearance'

export type UpdateHelpCenterInput = AppearanceInput & {
  id: string
  name: string
  slug: string
  primaryHex: string
  secondaryHex: string
  logoUrl?: string | null
  faviconUrl?: string | null
  headline?: string
  subtitle?: string
}

/**
 * Updates a help center's identity and appearance.
 *
 * Renaming the slug changes the center's public URL and the old one stops
 * working — there is no redirect by design. The uniqueness check excludes this
 * row so that saving without touching the slug is not a self-conflict.
 */
export async function updateHelpCenter(input: UpdateHelpCenterInput): Promise<{ slug: string }> {
  const name = input.name.trim()
  if (!name) throw new Error('Name is required.')

  const slug = slugify(input.slug)
  if (RESERVED_SLUGS.has(slug)) {
    throw new Error(`"${slug}" is a reserved slug and cannot be used for a help center.`)
  }

  assertHex(input.primaryHex, 'Primary color')
  assertHex(input.secondaryHex, 'Secondary color')

  const appearance = toAppearanceColumns(input)
  const db = serviceClient()

  const { data: clash, error: clashError } = await db
    .from('help_centers')
    .select('id')
    .eq('slug', slug)
    .neq('id', input.id)
    .maybeSingle()
  if (clashError) throw new Error(`Could not check slug availability: ${clashError.message}`)
  if (clash) throw new Error(`The slug "${slug}" is already in use.`)

  const settings: { headline?: string; subtitle?: string } = {}
  if (input.headline) settings.headline = input.headline
  if (input.subtitle) settings.subtitle = input.subtitle

  const { error } = await db
    .from('help_centers')
    .update({
      name,
      slug,
      primary_hex: input.primaryHex,
      secondary_hex: input.secondaryHex,
      logo_url: input.logoUrl || null,
      favicon_url: input.faviconUrl || null,
      settings,
      ...appearance,
    })
    .eq('id', input.id)

  if (error) throw new Error(`Could not update help center: ${error.message}`)

  return { slug }
}
