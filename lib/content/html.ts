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
 * remaining tags are stripped. Entities are decoded last so the result is
 * genuine plain text.
 */
export function htmlToText(html: string): string {
  const wellFormed = sanitizeHtml(html, ARTICLE_OPTIONS)
  const spaced = wellFormed.replace(/<[^>]+>/g, ' ')
  const stripped = sanitizeHtml(spaced, { allowedTags: [], allowedAttributes: {} })
  const decoded = decodeHtmlEntities(stripped)

  // Decoding can reconstitute tag-like text that the parser had escaped as a
  // single unit (e.g. an orphaned "&lt;/script&gt;" produced by a malformed
  // attempt to smuggle a script tag past the parser above). Re-parse once
  // more so any such fragment is recognized and dropped as real markup,
  // while inert stray brackets in ordinary prose (which do not form valid
  // tag syntax) simply get re-escaped and are decoded back below.
  const reparsed = sanitizeHtml(decoded, { allowedTags: [], allowedAttributes: {} })

  return decodeHtmlEntities(reparsed).replace(/\s+/g, ' ').trim()
}
