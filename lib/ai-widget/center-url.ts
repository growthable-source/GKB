import { serviceClient } from '@/lib/db/client'

/**
 * The URL Xovera should treat as the widget's home.
 *
 * It seeds the origin allowlist, so it wants to be the address visitors
 * actually load: a verified custom domain when the centre has one, and the
 * path-addressed URL on our own host otherwise.
 *
 * NOTE for whoever wires the allowlist on Xovera's side: a path-addressed
 * centre shares its origin with every other centre on this deployment, so the
 * allowlist can only be as tight as `app.growthable.io` for those. Isolation
 * between path-addressed tenants comes from the widget's own public key, not
 * from the origin. Custom-domain centres get real per-tenant isolation.
 */
export function helpCenterUrl(
  origin: string,
  slug: string,
  customDomain: string | null,
): string {
  if (customDomain) return `https://${customDomain}`
  return `${origin.replace(/\/+$/, '')}/hc/${slug}`
}

/** The centre's verified custom domain, or null. Unverified domains do not serve traffic. */
export async function activeCustomDomain(helpCenterId: string): Promise<string | null> {
  const { data, error } = await serviceClient()
    .from('custom_domains')
    .select('hostname')
    .eq('help_center_id', helpCenterId)
    .eq('status', 'active')
    .maybeSingle()

  // Not fatal: falling back to the path-addressed URL is always correct, just
  // less specific. Failing the whole provision over this would be worse.
  if (error) {
    console.error(`Could not read the custom domain for ${helpCenterId}: ${error.message}`)
    return null
  }
  return data?.hostname ?? null
}
