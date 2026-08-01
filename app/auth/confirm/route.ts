import { type EmailOtpType } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import { userClient } from '@/lib/db/client'
import { safeNext } from '@/lib/auth/safe-next'

export async function GET(request: Request) {
  const url = new URL(request.url)
  const token_hash = url.searchParams.get('token_hash')
  const type = url.searchParams.get('type') as EmailOtpType | null
  const next = safeNext(url.searchParams.get('next'))

  if (!token_hash || !type) redirect('/login?error=invalid-link')

  const supabase = await userClient()
  const { error } = await supabase.auth.verifyOtp({ type, token_hash })
  if (error) redirect(`/login?error=${encodeURIComponent(error.message)}`)

  redirect(next)
}
