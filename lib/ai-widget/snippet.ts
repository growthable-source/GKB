/**
 * Reading the embed URL out of Xovera's snippet.
 *
 * Xovera hands back `embedSnippet` as a ready-to-paste `<script>` string. We do
 * not paste it: it would have to go through dangerouslySetInnerHTML on every
 * tenant's public pages, which makes a third-party string into stored XSS
 * across every help centre we serve. Instead the public layout renders a real
 * `<script>` element, and the only thing it needs from the snippet is the src —
 * the widget id and public key come from the typed `widget` object in the same
 * response, not from parsing.
 *
 * So this extracts exactly one value and validates it. Anything unexpected
 * returns null, and the caller records a failed install rather than embedding
 * something it could not read.
 */

/** `src="..."` or `src='...'`, first occurrence. */
const SRC = /\ssrc\s*=\s*("([^"]*)"|'([^']*)')/i

/**
 * The script URL from an embed snippet, or null if there isn't a usable one.
 *
 * https only. The snippet lands in a `<script src>` on customer-facing pages,
 * so an http URL is a mixed-content failure at best and a downgrade attack at
 * worst, and a `javascript:` or `data:` URL would be neither of those but far
 * worse.
 */
export function scriptSrcFrom(snippet: string | null | undefined): string | null {
  if (!snippet) return null

  const match = SRC.exec(snippet)
  const raw = match?.[2] ?? match?.[3]
  if (!raw) return null

  let url: URL
  try {
    url = new URL(raw.trim())
  } catch {
    // Relative URLs included: we have no base to resolve them against that we
    // would trust, since the snippet is served from Xovera's API host and the
    // widget may not be.
    return null
  }

  if (url.protocol !== 'https:') return null
  return url.toString()
}
