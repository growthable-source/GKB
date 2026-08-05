import { type EmailOtpType } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import { userClient } from '@/lib/db/client'
import { safeNext, DEFAULT_NEXT } from '@/lib/auth/safe-next'
import { findPendingSignupByEmail } from '@/lib/signup/repository'

export async function GET(request: Request) {
  const url = new URL(request.url)
  const token_hash = url.searchParams.get('token_hash')
  const type = url.searchParams.get('type') as EmailOtpType | null
  const next = safeNext(url.searchParams.get('next'))

  if (!token_hash || !type) redirect('/login?error=invalid-link')

  const supabase = await userClient()
  const { data, error } = await supabase.auth.verifyOtp({ type, token_hash })
  if (error) redirect(`/login?error=${encodeURIComponent(error.message)}`)

  // The magic-link template hardcodes its return URL and ignores RedirectTo,
  // so a signup finishing its funnel cannot say where it wants to land. The
  // pending row says it instead — and only when the caller asked for nothing
  // in particular, so an explicit `next` always wins.
  const email = data.user?.email
  if (next === DEFAULT_NEXT && email && (await findPendingSignupByEmail(email))) {
    redirect('/get/claim')
  }

  redirect(next)
}
