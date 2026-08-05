/**
 * Path-addressed help centers.
 *
 * A customer center lives at `/hc/{slug}` on this deployment rather than on a
 * hostname of its own. Middleware parses the slug out of the URL, rewrites the
 * request to the plain public route, and forwards both the slug and the prefix
 * as headers — the same channel `?preview=` already uses, because middleware is
 * the only layer holding both the URL and the ability to inject headers for
 * downstream Server Components.
 *
 * Getting this parse wrong leaks one tenant into another, so it is exhaustively
 * unit tested.
 */

export const CENTER_PATH_PREFIX = 'hc'

/** Set by middleware. Read by getActiveHelpCenter(). */
export const CENTER_SLUG_HEADER = 'x-help-center-slug'

/** Set by middleware. Read by basePath(), which prefixes every public link. */
export const CENTER_BASE_PATH_HEADER = 'x-help-center-base-path'

export type CenterPath = {
  /** The center's slug, as it appears in the URL. */
  slug: string
  /** What every link in the rendered page must be prefixed with. */
  basePath: string
  /** The public route the request rewrites to, always starting with `/`. */
  rewriteTo: string
}

// A slug is what slugify() emits: lowercase alphanumerics and hyphens.
// Anything else is not a center address, so the path falls through untouched.
const SLUG = /^[a-z0-9][a-z0-9-]*$/

/**
 * Parses `/hc/{slug}/rest` into its slug and the route it rewrites to, or null
 * when the path does not address a center.
 *
 * `/hc` and `/hc/` alone are not center addresses — there is no slug — and a
 * malformed slug is rejected rather than passed to a database lookup.
 */
export function parseCenterPath(pathname: string): CenterPath | null {
  const segments = pathname.split('/').filter(Boolean)

  if (segments[0] !== CENTER_PATH_PREFIX) return null

  const slug = segments[1]
  if (!slug || !SLUG.test(slug)) return null

  const rest = segments.slice(2).join('/')

  return {
    slug,
    basePath: `/${CENTER_PATH_PREFIX}/${slug}`,
    rewriteTo: `/${rest}`,
  }
}
