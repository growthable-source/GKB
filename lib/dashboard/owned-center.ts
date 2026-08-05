import { cache } from 'react'
import { serviceClient } from '@/lib/db/client'
import { currentActor } from '@/lib/authz/authorize'

export type OwnedCenter = {
  id: string
  slug: string
  name: string
  primaryHex: string
  secondaryHex: string
  logoUrl: string | null
  faviconUrl: string | null
  headline: string | null
  subtitle: string | null
  heroStyle: string
  heroAngle: number
  bodyFont: string | null
  headingFont: string | null
  tilesPerRow: number
}

/**
 * The one help center the signed-in customer owns, or null.
 *
 * Resolved from their center-scoped membership rather than from a URL, so no
 * dashboard route ever has to be trusted with an id — a customer cannot ask for
 * a center that is not theirs, because they never name one.
 */
export const getOwnedCenter = cache(async (): Promise<OwnedCenter | null> => {
  const actor = await currentActor()
  if (!actor.userId) return null

  const scoped = actor.memberships.find((membership) => membership.helpCenterId !== null)
  if (!scoped?.helpCenterId) return null

  const { data, error } = await serviceClient()
    .from('help_centers')
    .select(
      'id, slug, name, primary_hex, secondary_hex, logo_url, favicon_url, settings, hero_style, hero_angle, font_family, heading_font, tiles_per_row',
    )
    .eq('id', scoped.helpCenterId)
    .maybeSingle()

  if (error) throw new Error(`Could not load your help centre: ${error.message}`)
  if (!data) return null

  const settings = (data.settings ?? {}) as { headline?: string; subtitle?: string }

  return {
    id: data.id,
    slug: data.slug,
    name: data.name,
    primaryHex: data.primary_hex,
    secondaryHex: data.secondary_hex,
    logoUrl: data.logo_url,
    faviconUrl: data.favicon_url,
    headline: settings.headline ?? null,
    subtitle: settings.subtitle ?? null,
    heroStyle: data.hero_style,
    heroAngle: data.hero_angle,
    bodyFont: data.font_family,
    headingFont: data.heading_font,
    tilesPerRow: data.tiles_per_row,
  }
})
