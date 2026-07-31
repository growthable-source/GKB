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
 * Plain text for search indexing and excerpts. Every tag (and, for
 * script/style, its contents) is replaced with a space rather than deleted
 * outright, so words that were separated by markup do not run together, and
 * no tag markup survives into the stored text.
 */
export function htmlToText(html: string): string {
  const withoutScripts = html.replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
  const spaced = withoutScripts.replace(/<[^>]+>/g, ' ')
  return spaced.replace(/\s+/g, ' ').trim()
}
