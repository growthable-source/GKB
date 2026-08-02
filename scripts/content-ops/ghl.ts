/**
 * Shared helpers for talking to GoHighLevel's public Freshdesk-based help
 * center (help.gohighlevel.com): the sitemap fetch used to enumerate their
 * article URLs (gap.mts, seed.mts phase 1) and the article-page extraction
 * used to pull grounding text out of one of their pages (seed.mts phase 2).
 *
 * Fetch-only concerns live here — nothing in this module talks to Supabase
 * or DeepSeek.
 */

export const KNOWN_SITEMAP_URL = 'https://help.gohighlevel.com/support/sitemap.xml'
export const ROBOTS_URL = 'https://help.gohighlevel.com/robots.txt'
export const USER_AGENT = 'Mozilla/5.0 (compatible; GKB-content-ops/1.0)'
export const ARTICLE_PATH = '/support/solutions/articles/'

export async function fetchText(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } })
    if (!res.ok) return null
    return await res.text()
  } catch {
    return null
  }
}

/**
 * Finds and fetches their sitemap: the bare /sitemap.xml at the domain root
 * 404s, so this tries the known /support/sitemap.xml URL first and falls
 * back to whatever the `Sitemap:` line in robots.txt points at.
 */
export async function fetchTheirArticleUrls(): Promise<{ urls: string[]; sourceUrl: string } | null> {
  let xml = await fetchText(KNOWN_SITEMAP_URL)
  let sourceUrl = KNOWN_SITEMAP_URL
  if (!xml) {
    const robots = await fetchText(ROBOTS_URL)
    const m = robots ? /^Sitemap:\s*(\S+)/im.exec(robots) : null
    if (m) {
      sourceUrl = m[1]
      xml = await fetchText(sourceUrl)
    }
  }
  if (!xml) return null
  const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)]
    .map((m) => m[1])
    .filter((u) => u.includes(ARTICLE_PATH))
  return { urls, sourceUrl }
}

/** Derives a title-ish string from an article URL's slug, e.g. `.../48000979915-where-do-survey-answers-show-up` -> "Where Do Survey Answers Show Up". */
export function titleFromSlug(url: string): string {
  const last = url.split('/').filter(Boolean).pop() ?? ''
  const withoutId = last.replace(/^\d+-/, '').replace(/-+$/, '')
  const words = decodeURIComponent(withoutId)
    .split('-')
    .filter(Boolean)
  return words.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ') || last
}

function stripTags(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Extracts title + main article text from one of their article pages.
 * Verified live on 2026-08-02 against several sample article URLs: the
 * portal is server-rendered (not a JS SPA) and every article page follows
 * the same Freshdesk theme markup —
 *   <h1 class="fw-page-title">...</h1>
 *   <div class="fw-content fw-content--single-article ...">...content...</div>
 * with the content div immediately followed by a `fw-feedback` block (the
 * "Was this article helpful?" widget), which makes a reliable end marker.
 * A crude tag-strip + whitespace collapse is intentional: this text is fed
 * to DeepSeek as grounding, not rendered, so it doesn't need to be clean
 * markup — just faithful prose.
 */
export function extractArticleContent(html: string): { title: string | null; text: string } {
  const cleaned = html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')

  const titleMatch = /<h1[^>]*\bclass="[^"]*\bfw-page-title\b[^"]*"[^>]*>([\s\S]*?)<\/h1>/i.exec(cleaned)
  const title = titleMatch ? stripTags(titleMatch[1]).trim() || null : null

  const contentStart = /\bclass="fw-content\b[^"]*"[^>]*>/i.exec(cleaned)
  if (!contentStart) return { title, text: '' }

  const start = contentStart.index + contentStart[0].length
  const endIdx = cleaned.indexOf('fw-feedback', start)
  const raw = endIdx > -1 ? cleaned.slice(start, endIdx) : cleaned.slice(start, start + 40_000)
  return { title, text: stripTags(raw) }
}
