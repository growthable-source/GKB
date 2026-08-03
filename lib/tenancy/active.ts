import { cache } from 'react'
import { unstable_cache } from 'next/cache'
import { headers } from 'next/headers'
import { serviceClient } from '@/lib/db/client'
import { BRAND_TAG, BRAND_TTL_SECONDS } from '@/lib/cache/tags'

export type ActiveHelpCenter = {
  id: string
  slug: string
  name: string
  primaryHex: string
  secondaryHex: string
  logoUrl: string | null
  faviconUrl: string | null
  visibility: 'public' | 'authenticated'
  settings: { headline?: string; subtitle?: string }
}

const VALID_VISIBILITIES = ['public', 'authenticated'] as const

const HELP_CENTER_FIELDS =
  'id, slug, name, primary_hex, secondary_hex, logo_url, favicon_url, visibility, settings'

type HelpCenterRow = {
  id: string
  slug: string
  name: string
  primary_hex: string
  secondary_hex: string
  logo_url: string | null
  favicon_url: string | null
  visibility: string
  settings: unknown
}

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

function toActiveHelpCenter(row: HelpCenterRow): ActiveHelpCenter {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    primaryHex: row.primary_hex,
    secondaryHex: row.secondary_hex,
    logoUrl: row.logo_url,
    faviconUrl: row.favicon_url,
    visibility: parseVisibility(row.visibility),
    settings: (row.settings ?? {}) as ActiveHelpCenter['settings'],
  }
}

/** The help center whose custom domain exactly matches this hostname, if any. */
async function findByHostname(
  db: ReturnType<typeof serviceClient>,
  hostname: string,
): Promise<HelpCenterRow | null> {
  const { data, error } = await db
    .from('custom_domains')
    .select(`help_centers!inner (${HELP_CENTER_FIELDS})`)
    .eq('hostname', hostname)
    .maybeSingle()

  if (error) throw new Error(`getActiveHelpCenter (custom_domains) failed: ${error.message}`)
  return data ? (data.help_centers as unknown as HelpCenterRow) : null
}

/** The help center whose slug matches the hostname's first DNS label, if any. */
async function findBySlug(
  db: ReturnType<typeof serviceClient>,
  label: string,
): Promise<HelpCenterRow | null> {
  const { data, error } = await db
    .from('help_centers')
    .select(HELP_CENTER_FIELDS)
    .eq('slug', label)
    .maybeSingle()

  if (error) throw new Error(`getActiveHelpCenter (slug) failed: ${error.message}`)
  return data
}

/**
 * Cross-request caches over the three brand lookups. React's cache() below
 * dedupes only within one render; help_centers and custom_domains rows change
 * roughly never, so re-querying them per visitor cost every route in the app —
 * including /login and /admin — a round trip before any page code ran.
 *
 * Only the DB reads are cached. The headers() read stays in the request-scoped
 * function below, where it belongs.
 */
const cachedFindByHostname = unstable_cache(
  (hostname: string) => findByHostname(serviceClient(), hostname),
  ['help-center-by-hostname'],
  { tags: [BRAND_TAG], revalidate: BRAND_TTL_SECONDS },
)

const cachedFindBySlug = unstable_cache(
  (slug: string) => findBySlug(serviceClient(), slug),
  ['help-center-by-slug'],
  { tags: [BRAND_TAG], revalidate: BRAND_TTL_SECONDS },
)

// Returns null rather than throwing on a missing base row, so it can be
// prefetched alongside the host lookups without turning a resolvable request
// into an error. Callers that actually need the row throw.
const cachedFindBase = unstable_cache(
  async (): Promise<HelpCenterRow | null> => {
    const { data, error } = await serviceClient()
      .from('help_centers')
      .select(HELP_CENTER_FIELDS)
      .eq('is_base', true)
      .maybeSingle()

    if (error) throw new Error(`No base help center found: ${error.message}`)
    return data
  },
  ['help-center-base'],
  { tags: [BRAND_TAG], revalidate: BRAND_TTL_SECONDS },
)

/**
 * The help center serving the current request, resolved from the Host header:
 * an exact custom-domain match, then a slug match on the hostname's first DNS
 * label, then the base center. `headers()` is request-scoped, so caching this
 * per request with `cache()` stays correct.
 *
 * A `?preview=<slug>` query param (translated to the x-preview-help-center-
 * slug header by middleware.ts, since only middleware sees the URL) wins
 * over host resolution — it lets any center's BRANDING be viewed on this
 * deployment's own URL ahead of a tenant domain existing. Falls through to
 * normal resolution on an unknown slug rather than erroring.
 */
export const getActiveHelpCenter = cache(async (): Promise<ActiveHelpCenter> => {
  const requestHeaders = await headers()

  const previewSlug = requestHeaders.get('x-preview-help-center-slug')
  const hostname = requestHeaders.get('host')?.split(':')[0].toLowerCase() ?? ''
  const label = hostname.split('.')[0]
  const wantsSlug = Boolean(label) && label !== 'www'

  // Every candidate is an independent lookup and most requests match none of
  // them, so resolving them concurrently costs one round trip instead of up to
  // four. Precedence is decided below, by the order of these checks — never by
  // which query happens to resolve first.
  const [preview, byDomain, bySlug, base] = await Promise.all([
    // Deliberately NOT cached. `?preview=` accepts any string from any visitor,
    // so caching it would let anyone flood the data cache with junk keys. The
    // host lookups below are safe to cache: Vercel only routes a request here
    // when its Host matches a domain assigned to this deployment.
    previewSlug ? findBySlug(serviceClient(), previewSlug) : null,
    hostname ? cachedFindByHostname(hostname) : null,
    hostname && wantsSlug ? cachedFindBySlug(label) : null,
    cachedFindBase(),
  ])

  if (preview) return toActiveHelpCenter(preview)
  if (byDomain) return toActiveHelpCenter(byDomain)
  if (bySlug) return toActiveHelpCenter(bySlug)
  if (!base) throw new Error('No base help center found: missing row')

  return toActiveHelpCenter(base)
})

/**
 * The base help center's id — the single owner of all shared content.
 *
 * Help centers are brand skins, not content forks: every collection and
 * article lives once, in the base center's placement and search rows. A
 * non-base center differs only in name/colors/logo/favicon/domain — it has
 * no placement or search rows of its own. `getActiveHelpCenter()` resolves
 * BRAND from the request's Host header (which center's colors/logo/name to
 * render); `getBaseHelpCenterId()` resolves the single CONTENT owner (what
 * every brand reads through). These are deliberately different concepts —
 * content-fetching and content-writing code must always use this, never
 * `getActiveHelpCenter().id`, or a non-base brand will silently show empty
 * or diverged content.
 */
export const getBaseHelpCenterId = cache(async (): Promise<string> => {
  // Shares cachedFindBase with getActiveHelpCenter rather than issuing its own
  // is_base query: this is the highest-frequency, lowest-volatility read in the
  // codebase, and most requests need both the brand and the content owner.
  const base = await cachedFindBase()
  if (!base) throw new Error('No base help center found: missing row')
  return base.id
})
