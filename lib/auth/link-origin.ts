import { requestOrigin } from '@/lib/signup/origin'

/**
 * The origin to build EMAILED AUTH LINKS from (login, signup confirm,
 * team invite).
 *
 * These must NOT use the raw request Host. The links carry a live
 * token and are concatenated directly into the email (redirectTo is
 * deliberately omitted, so Supabase's allowlist never bounds them) —
 * so if /login is served on a customer's own custom domain, a raw-host
 * origin would email a working session token pointed at that domain.
 * Auth is centralised: every auth link goes to our canonical host,
 * whatever hostname the form was posted on.
 *
 * NEXT_PUBLIC_SITE_URL is the canonical host (corrected in Vercel to
 * https://whitelabelghl.growthable.io). Falls back to the request
 * origin only in local dev where the env var is unset.
 */
export async function authLinkOrigin(): Promise<string> {
  const configured = process.env.NEXT_PUBLIC_SITE_URL
  if (configured && /^https:\/\//i.test(configured)) {
    return configured.replace(/\/+$/, '')
  }
  // Dev / unconfigured: the request host is fine (localhost, single host).
  return requestOrigin()
}
