import { serviceClient } from '@/lib/db/client'
import { slugify, uniqueSlug } from '@/lib/content/slug'
import { RESERVED_SLUGS } from '@/lib/tenancy/reserved-slugs'

export type SlugCheck =
  | { available: true; slug: string }
  | { available: false; slug: string; reason: string }

/**
 * Whether a center address is free, across all three things that can hold one:
 * the reserved list, existing centers, and other pending signups.
 *
 * The pending check is what stops two people in the funnel at the same time
 * from both being promised `acme`. It is advisory — the database's partial
 * unique index is the real guarantee — but it moves the collision from the
 * claim screen, where it would be a nasty surprise, to the builder, where it
 * is a normal piece of form feedback.
 */
export async function checkSlugAvailable(input: string, forSignupId?: string): Promise<SlugCheck> {
  const slug = slugify(input)

  if (!input.trim()) {
    return { available: false, slug, reason: 'Choose an address for your help centre.' }
  }

  if (RESERVED_SLUGS.has(slug)) {
    return { available: false, slug, reason: `"${slug}" is reserved. Try another address.` }
  }

  const db = serviceClient()

  const { data: center, error: centerError } = await db
    .from('help_centers')
    .select('id')
    .eq('slug', slug)
    .maybeSingle()
  if (centerError) throw new Error(`Could not check the address: ${centerError.message}`)
  if (center) return { available: false, slug, reason: `"${slug}" is already taken.` }

  let pending = db
    .from('signups')
    .select('id')
    .eq('center_slug', slug)
    .is('claimed_at', null)
  if (forSignupId) pending = pending.neq('id', forSignupId)

  const { data: held, error: pendingError } = await pending.maybeSingle()
  if (pendingError) throw new Error(`Could not check the address: ${pendingError.message}`)
  if (held) return { available: false, slug, reason: `"${slug}" is already taken.` }

  return { available: true, slug }
}

/**
 * A free address near `base`, for the claim step.
 *
 * nextAvailableSlug() in lib/content covers articles and collections; centers
 * need both their own table and the pending signups checked, so this walks the
 * same `base-2, base-3` sequence over the union of the two.
 */
export async function nextAvailableCenterSlug(base: string): Promise<string> {
  const wanted = slugify(base)
  const db = serviceClient()

  const [{ data: centers, error: centerError }, { data: pending, error: pendingError }] =
    await Promise.all([
      db.from('help_centers').select('slug').like('slug', `${wanted}%`),
      db.from('signups').select('center_slug').like('center_slug', `${wanted}%`).is('claimed_at', null),
    ])

  if (centerError) throw new Error(`Could not pick an address: ${centerError.message}`)
  if (pendingError) throw new Error(`Could not pick an address: ${pendingError.message}`)

  const taken = [
    ...(centers ?? []).map((row) => row.slug),
    ...(pending ?? []).map((row) => row.center_slug).filter((slug): slug is string => Boolean(slug)),
    ...RESERVED_SLUGS,
  ]

  return uniqueSlug(wanted, taken)
}
