import sanitizeHtml from 'sanitize-html'
import { serviceClient } from '@/lib/db/client'

export type SearchHit = {
  articleId: string
  slug: string
  title: string
  /** Body excerpt with <mark> around matches. Safe: derived from sanitized text. */
  headline: string
}

export async function searchHelpCenter(
  helpCenterId: string,
  query: string,
  limit = 20,
): Promise<SearchHit[]> {
  const trimmed = query.trim()
  if (!trimmed) return []

  const { data, error } = await serviceClient().rpc('search_help_center', {
    p_help_center_id: helpCenterId,
    p_query: trimmed,
    p_limit: limit,
  })

  if (error) throw new Error(`searchHelpCenter failed: ${error.message}`)

  return (data ?? []).map((row) => ({
    articleId: row.article_id,
    slug: row.slug,
    title: row.title,
    // ts_headline does not escape its input, so body_text is re-parsed as HTML
    // here and only the <mark> tags it introduced are allowed to survive —
    // this is the last line of defense before the headline is ever rendered
    // with dangerouslySetInnerHTML.
    headline: sanitizeHtml(row.headline ?? '', { allowedTags: ['mark'], allowedAttributes: {} }),
  }))
}
