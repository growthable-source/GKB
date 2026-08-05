import { headers } from 'next/headers'

/**
 * The origin the visitor is actually on.
 *
 * Sign-in links were built from NEXT_PUBLIC_SITE_URL, which is a single value
 * for an app that answers on several hostnames — the marketing domain today,
 * customer custom domains later. When it disagreed with reality, people were
 * emailed a link to a different host than the one they signed up on.
 *
 * The request's own host is the correct answer by construction. It is
 * attacker-influenceable in general, so it is not trusted on its own: Supabase
 * only honours a redirect that appears in the project's Redirect URLs
 * allowlist, which is what actually bounds this. The env var stays as the
 * fallback for contexts with no request (scripts, jobs).
 */
export async function requestOrigin(): Promise<string> {
  const requestHeaders = await headers()
  const host = requestHeaders.get('host')

  if (host) {
    const forwarded = requestHeaders.get('x-forwarded-proto')
    const protocol = forwarded ?? (host.startsWith('localhost') ? 'http' : 'https')
    return `${protocol}://${host}`
  }

  return process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'
}
