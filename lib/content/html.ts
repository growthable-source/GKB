import sanitizeHtml from 'sanitize-html'

const ARTICLE_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    'h2', 'h3', 'h4', 'p', 'strong', 'em', 'u', 's', 'code', 'pre', 'blockquote',
    'ul', 'ol', 'li', 'a', 'img', 'hr', 'br', 'table', 'thead', 'tbody', 'tr', 'th', 'td',
  ],
  allowedAttributes: {
    a: ['href', 'title', 'target', 'rel'],
    img: ['src', 'alt', 'title', 'width', 'height'],
    '*': ['class'],
  },
  allowedSchemes: ['http', 'https', 'mailto'],
  transformTags: {
    a: sanitizeHtml.simpleTransform('a', { rel: 'noopener noreferrer' }, true),
  },
}

/** Sanitizes editor or imported HTML before it is stored or rendered. */
export function sanitizeArticleHtml(html: string): string {
  return sanitizeHtml(html, ARTICLE_OPTIONS)
}

/**
 * Decodes the handful of HTML entities that can appear in sanitizer output
 * (named entities plus numeric character references) so callers get genuine
 * plain text rather than escaped markup. `&amp;` is decoded last so an
 * entity like `&amp;lt;` does not double-decode into `<`.
 *
 * SECURITY: callers must invoke this exactly once per input. Decoding twice
 * (or looping until a fixed point) can turn inert escaped text such as
 * `&amp;lt;script&amp;gt;` — which decodes once to the harmless literal
 * string `&lt;script&gt;` — into live-looking markup `<script>` on a second
 * pass. `htmlToText` below relies on single-decode semantics for safety; do
 * not add a second call to "helpfully" catch more entities.
 */
function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
}

/**
 * Plain text for search indexing and excerpts.
 *
 * Hand-rolled tag stripping (a regex like `/<[^>]+>/g`) is unsafe here: it
 * cannot see across an unclosed tag, so a fragment like `<img src=x
 * onerror=alert(1)` (no closing `>`) survives verbatim, and a naive "delete
 * everything between < and >" approach also destroys legitimate prose like
 * "a < b and c > d". Instead this parses the input with the real HTML parser
 * first — which normalizes and closes malformed markup and escapes bare `<`
 * in prose to `&lt;` — before tag boundaries are turned into spaces and any
 * remaining tags are stripped. Entities are decoded exactly once at the end
 * so the result is genuine plain text.
 *
 * This function does NOT guarantee its output is free of `<` — plain text
 * can legitimately contain it (e.g. "if x < y"), and there is no safe way to
 * strip it without also destroying real prose or reopening the double-decode
 * bug described on `decodeHtmlEntities`. XSS safety for the two consumers of
 * this text is enforced elsewhere: `body_text` is only ever rendered through
 * `ts_headline`, whose output is re-sanitized down to `allowedTags: ['mark']`
 * before it reaches the page (see `searchHelpCenter` in
 * `lib/search/search.ts`), and `excerpt` is rendered through JSX, which
 * escapes text nodes automatically. Do not add tag-stripping here to
 * compensate for a render site that fails to sanitize or escape — fix that
 * render site instead.
 */
export function htmlToText(html: string): string {
  const wellFormed = sanitizeHtml(html, ARTICLE_OPTIONS)
  const spaced = wellFormed.replace(/<[^>]+>/g, ' ')
  const stripped = sanitizeHtml(spaced, { allowedTags: [], allowedAttributes: {} })
  return decodeHtmlEntities(stripped).replace(/\s+/g, ' ').trim()
}
