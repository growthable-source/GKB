import { FREE_EMAIL_DOMAINS } from './free-email-domains'

export type WorkEmailResult =
  | { ok: true; email: string; domain: string }
  | { ok: false; error: string }

// Deliberately permissive. Real deliverability is proven by the magic link
// actually arriving, so this only rejects what is obviously not an address —
// a stricter pattern would turn valid-but-unusual addresses into support mail.
const SHAPE = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/

/**
 * Normalizes an address and rejects consumer mail domains.
 *
 * Returns the lowercased address so callers store exactly what was validated —
 * the pending-signup unique index is on `lower(email)`, and normalizing in two
 * places invites them to disagree.
 */
export function checkWorkEmail(input: string): WorkEmailResult {
  const email = input.trim().toLowerCase()

  if (!email) return { ok: false, error: 'Enter your work email address.' }
  if (!SHAPE.test(email)) {
    return { ok: false, error: `"${input.trim()}" doesn't look like an email address.` }
  }

  const domain = email.slice(email.lastIndexOf('@') + 1)

  if (FREE_EMAIL_DOMAINS.has(domain)) {
    return {
      ok: false,
      error: `${domain} addresses aren't accepted — use the domain your agency trades under.`,
    }
  }

  return { ok: true, email, domain }
}

/** Convenience predicate for client-side hinting. Server code wants checkWorkEmail. */
export function isWorkEmail(input: string): boolean {
  return checkWorkEmail(input).ok
}
