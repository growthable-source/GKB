import { serviceClient, userClient } from '@/lib/db/client'
import { canSendEmail, sendEmail } from '@/lib/email/resend'
import {
  confirmSignupHtml,
  confirmSignupSubject,
  confirmSignupText,
} from '@/lib/email/confirm-signup-email'
import { updateSignup, type Signup } from './repository'

/** How long before the same signup may request another link. */
const COOLDOWN_SECONDS = 60

export type SendLinkResult = { ok: true } | { ok: false; error: string }

/**
 * Makes sure an auth user exists for this address.
 *
 * generateLink('magiclink') only works for a user that already exists, and
 * generateLink('signup') demands a password we have no business inventing. So
 * the user is created first, unconfirmed — verifying the link is what confirms
 * them. A duplicate is not an error here: two tabs, or a resend, land in
 * exactly this path.
 */
export async function ensureUser(email: string): Promise<void> {
  const { error } = await serviceClient().auth.admin.createUser({
    email,
    email_confirm: false,
  })

  if (!error) return
  if (/already|exists|registered/i.test(error.message)) return
  throw new Error(`Could not prepare your account: ${error.message}`)
}

/**
 * Sends the confirmation link for a pending signup.
 *
 * The token still comes from Supabase — it is the identity provider, and it is
 * what /auth/confirm validates. Only DELIVERY moved here, which buys three
 * things: the template is a reviewed file rather than dashboard config, the
 * email carries the same brand as the funnel, and the link is built from an
 * origin we choose instead of one Supabase has to be configured to permit.
 *
 * Without a Resend key it falls back to signInWithOtp, so local development
 * keeps working against Mailpit with nothing to configure.
 */
export async function sendConfirmationLink(
  signup: Signup,
  origin: string,
): Promise<SendLinkResult> {
  if (signup.link_sent_at) {
    const elapsed = (Date.now() - new Date(signup.link_sent_at).getTime()) / 1000
    if (elapsed < COOLDOWN_SECONDS) {
      const wait = Math.ceil(COOLDOWN_SECONDS - elapsed)
      return { ok: false, error: `We just sent that. Try again in ${wait} seconds.` }
    }
  }

  if (!canSendEmail()) {
    // Local dev only (Mailpit catches signInWithOtp). In production a
    // missing key must fail loudly — the silent fallback quietly moved
    // every funnel email onto Supabase's sender once already.
    if (process.env.NODE_ENV === 'production') {
      console.error('[signup] RESEND_API_KEY missing in production — refusing to fall back to Supabase mail')
      return { ok: false, error: 'Confirmation emails are temporarily unavailable. Please try again shortly.' }
    }
    const supabase = await userClient()
    const { error } = await supabase.auth.signInWithOtp({
      email: signup.email,
      options: { emailRedirectTo: `${origin}/auth/confirm` },
    })
    if (error) return { ok: false, error: `We could not send your email: ${error.message}` }

    await updateSignup(signup.id, { link_sent_at: new Date().toISOString() })
    return { ok: true }
  }

  await ensureUser(signup.email)

  const { data, error } = await serviceClient().auth.admin.generateLink({
    type: 'magiclink',
    email: signup.email,
    // No redirectTo on purpose. We build the confirm URL ourselves below, so
    // nothing here depends on Supabase's redirect allowlist agreeing with us.
  })

  if (error || !data?.properties?.hashed_token) {
    return { ok: false, error: `We could not create your sign-in link: ${error?.message}` }
  }

  const confirmUrl = `${origin}/auth/confirm?token_hash=${encodeURIComponent(
    data.properties.hashed_token,
  )}&type=magiclink`

  const centerName = signup.center_name ?? signup.agency_name ?? 'your help centre'
  const email = {
    fullName: signup.full_name,
    centerName,
    centerPath: `/hc/${signup.center_slug ?? ''}`,
    confirmUrl,
  }

  try {
    await sendEmail({
      to: signup.email,
      subject: confirmSignupSubject(centerName),
      html: confirmSignupHtml(email),
      text: confirmSignupText(email),
    })
  } catch (sendError) {
    const detail = sendError instanceof Error ? sendError.message : 'unknown error'
    console.error(`Confirmation email failed for ${signup.email}: ${detail}`)
    return { ok: false, error: 'We could not send your confirmation email. Try again in a moment.' }
  }

  await updateSignup(signup.id, { link_sent_at: new Date().toISOString() })
  return { ok: true }
}
