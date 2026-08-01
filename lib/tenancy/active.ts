import { cache } from 'react'
import { serviceClient } from '@/lib/db/client'

export type ActiveHelpCenter = {
  id: string
  slug: string
  name: string
  primaryHex: string
  secondaryHex: string
  logoUrl: string | null
  visibility: 'public' | 'authenticated'
  settings: { headline?: string; subtitle?: string }
}

const VALID_VISIBILITIES = ['public', 'authenticated'] as const

/**
 * Narrows the raw `visibility` column to the known union, throwing rather
 * than letting an unexpected value silently flow into access-gating logic —
 * this field decides whether the whole help center is publicly readable.
 */
// NOT ENFORCED yet: public pages don't consult visibility until private help
// centers land (Phase 3).
function parseVisibility(value: string): ActiveHelpCenter['visibility'] {
  if ((VALID_VISIBILITIES as readonly string[]).includes(value)) {
    return value as ActiveHelpCenter['visibility']
  }
  throw new Error(`Unexpected help_centers.visibility value: ${value}`)
}

/**
 * The help center serving the current request. Phase 1 always returns the base
 * center; Phase 2 resolves it from the Host header.
 */
export const getActiveHelpCenter = cache(async (): Promise<ActiveHelpCenter> => {
  const { data, error } = await serviceClient()
    .from('help_centers')
    .select('id, slug, name, primary_hex, secondary_hex, logo_url, visibility, settings')
    .eq('is_base', true)
    .single()

  if (error || !data) {
    throw new Error(`No base help center found: ${error?.message ?? 'missing row'}`)
  }

  return {
    id: data.id,
    slug: data.slug,
    name: data.name,
    primaryHex: data.primary_hex,
    secondaryHex: data.secondary_hex,
    logoUrl: data.logo_url,
    visibility: parseVisibility(data.visibility),
    settings: (data.settings ?? {}) as ActiveHelpCenter['settings'],
  }
})
