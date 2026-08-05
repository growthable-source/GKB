import { cookies } from 'next/headers'

/**
 * The funnel's identity before there is a session.
 *
 * A random token in an httpOnly cookie points at the pending `signups` row.
 * It is not a credential: the row holds no secrets, and the center is not
 * created until a magic link proves the email. The cookie only means "this
 * browser is partway through a signup".
 */
export const SIGNUP_COOKIE = 'gkb_signup'

const THIRTY_DAYS_SECONDS = 60 * 60 * 24 * 30

export function newSignupToken(): string {
  return crypto.randomUUID().replace(/-/g, '')
}

export async function readSignupToken(): Promise<string | null> {
  return (await cookies()).get(SIGNUP_COOKIE)?.value ?? null
}

export async function writeSignupToken(token: string): Promise<void> {
  ;(await cookies()).set(SIGNUP_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    // Matches the 30-day purge of abandoned rows: a cookie outliving its row
    // would resume into nothing.
    maxAge: THIRTY_DAYS_SECONDS,
  })
}

export async function clearSignupToken(): Promise<void> {
  ;(await cookies()).delete(SIGNUP_COOKIE)
}
