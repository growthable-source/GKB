'use server'

import { userClient } from '@/lib/db/client'

export async function sendMagicLink(
  _prev: { error?: string; sent?: boolean } | null,
  formData: FormData,
): Promise<{ error?: string; sent?: boolean }> {
  const email = String(formData.get('email') ?? '').trim()
  if (!email) return { error: 'Enter your email address.' }

  const supabase = await userClient()
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'}/auth/confirm`,
    },
  })

  if (error) return { error: error.message }
  return { sent: true }
}
