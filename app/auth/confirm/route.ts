import { type EmailOtpType, type User } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import { userClient } from '@/lib/db/client'
import { safeNext, DEFAULT_NEXT } from '@/lib/auth/safe-next'
import { findPendingSignupByEmail } from '@/lib/signup/repository'

/**
 * Exchanges a sign-in link for a session.
 *
 * Two link shapes have to work, because which one arrives depends on the email
 * template configured for the project rather than on anything in this codebase:
 *
 *   - `token_hash` + `type`, from the custom template in supabase/templates,
 *     which builds the URL itself.
 *   - `code`, from Supabase's stock template, which routes through its own
 *     verify endpoint and hands back a PKCE code.
 *
 * Handling only the first is what broke the last step of the signup funnel in
 * any environment whose template had not been customised.
 */
export async function GET(request: Request) {
  const url = new URL(request.url)
  const tokenHash = url.searchParams.get('token_hash')
  const type = url.searchParams.get('type') as EmailOtpType | null
  const code = url.searchParams.get('code')
  const next = safeNext(url.searchParams.get('next'))

  const supabase = await userClient()
  let user: User | null = null

  if (tokenHash && type) {
    const { data, error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash })
    if (error) redirect(`/login?error=${encodeURIComponent(error.message)}`)
    user = data.user
  } else if (code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)
    if (error) redirect(`/login?error=${encodeURIComponent(error.message)}`)
    user = data.user
  } else {
    redirect('/login?error=invalid-link')
  }

  // Neither template can carry a destination: the custom one hardcodes its URL,
  // and the stock one round-trips through Supabase. The pending signup row says
  // where to land instead — and only when the caller asked for nothing in
  // particular, so an explicit `next` always wins.
  const email = user?.email
  if (next === DEFAULT_NEXT && email && (await findPendingSignupByEmail(email))) {
    redirect('/get/claim')
  }

  redirect(next)
}
