'use server'

import { serviceClient, userClient } from '@/lib/db/client'
import { canSendEmail, sendEmail } from '@/lib/email/resend'
import { authLinkOrigin } from '@/lib/auth/link-origin'
import { loginLinkHtml, loginLinkSubject, loginLinkText } from '@/lib/email/login-link-email'

/**
 * Sends the /login magic link through OUR email path (Resend + the
 * reviewed template) instead of Supabase's built-in sender.
 *
 * Enumeration-safe AND user-safe: `generateLink({type:'magiclink'})`
 * does NOT error for an unknown address — GoTrue falls through to the
 * signup path and CREATES the user. So we must not call it blind: we
 * look the address up first and only mint+send when it already exists.
 * Either way the caller gets the same "sent" result, so the form can't
 * be used to tell which emails have accounts, and typing a stranger's
 * address never creates an account for them.
 *
 * Throttled: one send per address per 60s (module-level, best-effort —
 * survives within a warm lambda), so the endpoint can't be looped to
 * mailbomb a real inbox or burn Resend spend.
 */

const COOLDOWN_MS = 60_000
const lastSentByEmail = new Map<string, number>()

export async function sendMagicLink(
  _prev: { error?: string; sent?: boolean } | null,
  formData: FormData,
): Promise<{ error?: string; sent?: boolean }> {
  const email = String(formData.get('email') ?? '').trim().toLowerCase()
  if (!email) return { error: 'Enter your email address.' }

  const now = Date.now()
  const last = lastSentByEmail.get(email)
  // Uniform "sent" response even when throttled — no signal either way.
  if (last && now - last < COOLDOWN_MS) return { sent: true }

  if (!canSendEmail()) {
    if (process.env.NODE_ENV === 'production') {
      console.error('[login] RESEND_API_KEY missing in production — refusing to fall back to Supabase mail')
      return { error: 'Sign-in emails are temporarily unavailable. Please try again shortly.' }
    }
    const supabase = await userClient()
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${await authLinkOrigin()}/auth/confirm` },
    })
    if (error) return { error: error.message }
    return { sent: true }
  }

  const db = serviceClient()

  // Only send to an address that ALREADY has an account. generateLink
  // would otherwise create one; and this is what keeps the endpoint
  // from being an account-enumeration or account-creation oracle.
  // Paginated so it stays correct past 1000 accounts (bounded so a
  // login can't walk an unbounded table).
  let exists = false
  for (let page = 1; page <= 10 && !exists; page++) {
    const { data: list } = await db.auth.admin.listUsers({ page, perPage: 1000 })
    const users = list?.users ?? []
    if (users.some((u) => u.email?.toLowerCase() === email)) exists = true
    if (users.length < 1000) break
  }
  if (!exists) {
    // Same success response as a real send — no account, silently done.
    lastSentByEmail.set(email, now)
    return { sent: true }
  }

  const { data, error } = await db.auth.admin.generateLink({ type: 'magiclink', email })
  if (error || !data?.properties?.hashed_token) {
    console.error(`[login] could not create a sign-in link for an existing user: ${error?.message}`)
    return { error: 'We could not create your sign-in link. Try again in a moment.' }
  }

  const loginUrl = `${await authLinkOrigin()}/auth/confirm?token_hash=${encodeURIComponent(
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

  lastSentByEmail.set(email, now)
  return { sent: true }
}
