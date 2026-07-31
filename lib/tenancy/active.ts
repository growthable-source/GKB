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
    visibility: data.visibility as ActiveHelpCenter['visibility'],
    settings: (data.settings ?? {}) as ActiveHelpCenter['settings'],
  }
})
