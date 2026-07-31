export const DEFAULT_NEXT = '/admin/articles'

/**
 * Restricts a post-sign-in redirect target to same-origin relative paths.
 *
 * Without this, an attacker can craft a link on our own domain that signs the
 * victim in and then bounces them to an attacker-controlled page, borrowing our
 * domain's trust for phishing. A leading `//` or `/\` is protocol-relative and
 * resolves off-origin, so both are rejected along with absolute URLs.
 */
export function safeNext(raw: string | null | undefined): string {
  if (!raw) return DEFAULT_NEXT
  if (!raw.startsWith('/')) return DEFAULT_NEXT
  if (raw.startsWith('//') || raw.startsWith('/\\')) return DEFAULT_NEXT
  return raw
}
