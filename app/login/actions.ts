'use server'

import { serviceClient, userClient } from '@/lib/db/client'
import { canSendEmail, sendEmail } from '@/lib/email/resend'
import { loginLinkHtml, loginLinkSubject, loginLinkText } from '@/lib/email/login-link-email'

/**
 * Sends the /login magic link through OUR email path (Resend + the
 * reviewed template in lib/email/login-link-email.ts) instead of
 * Supabase's built-in sender — the last customer-facing email that
 * still left on Supabase's from-address.
 *
 * Deliberately enumeration-safe: generateLink('magiclink') only works
 * for an existing user, and we return the same "sent" result whether
 * the address has an account or not — unlike ensureUser() in the
 * signup flow, /login must never CREATE users, or any typed address
 * becomes an auth.users row.
 *
 * Without a Resend key: local dev falls back to signInWithOtp (Mailpit
 * catches it); production fails LOUDLY instead — a missing key
 * silently reverting the platform to Supabase's sender is exactly the
 * regression this file exists to prevent.
 */
export async function sendMagicLink(
  _prev: { error?: string; sent?: boolean } | null,
  formData: FormData,
): Promise<{ error?: string; sent?: boolean }> {
  const email = String(formData.get('email') ?? '').trim().toLowerCase()
  if (!email) return { error: 'Enter your email address.' }

  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'

  if (!canSendEmail()) {
    if (process.env.NODE_ENV === 'production') {
      console.error('[login] RESEND_API_KEY missing in production — refusing to fall back to Supabase mail')
      return { error: 'Sign-in emails are temporarily unavailable. Please try again shortly.' }
    }
    const supabase = await userClient()
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${origin}/auth/confirm` },
    })
    if (error) return { error: error.message }
    return { sent: true }
  }

  const { data, error } = await serviceClient().auth.admin.generateLink({
    type: 'magiclink',
    email,
    // No redirectTo on purpose — the confirm URL is built below from an
    // origin we choose (same stance as lib/signup/send-link.ts).
  })

  if (error || !data?.properties?.hashed_token) {
    // Unknown address → same success response as a real send, so the
    // form can't be used to probe which emails have accounts.
    if (error && /not.?found|does not exist|no user/i.test(error.message)) return { sent: true }
    console.error(`[login] could not create a sign-in link for ${email}: ${error?.message}`)
    return { error: 'We could not create your sign-in link. Try again in a moment.' }
  }

  const loginUrl = `${origin}/auth/confirm?token_hash=${encodeURIComponent(
    data.properties.hashed_token,
  )}&type=magiclink`

  try {
    await sendEmail({
      to: email,
      subject: loginLinkSubject(),
      html: loginLinkHtml({ loginUrl }),
      text: loginLinkText({ loginUrl }),
    })
  } catch (sendError) {
    const detail = sendError instanceof Error ? sendError.message : 'unknown error'
    console.error(`[login] sign-in email failed for ${email}: ${detail}`)
    return { error: 'We could not send your sign-in email. Try again in a moment.' }
  }

  return { sent: true }
}
