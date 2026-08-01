import { serviceClient } from '@/lib/db/client'
import { htmlToText } from '@/lib/content/html'
import { getEffectiveArticleForIndexing } from './effective'

/**
 * Writes the effective title and body text for one article in one help center.
 * `search_vector` is a generated column, so no vector is written here.
 */
export async function indexArticle(helpCenterId: string, articleId: string): Promise<void> {
  const effective = await getEffectiveArticleForIndexing(helpCenterId, articleId)

  if (!effective) {
    await serviceClient()
      .from('article_search')
      .delete()
      .eq('help_center_id', helpCenterId)
      .eq('article_id', articleId)
    return
  }

  const { error } = await serviceClient().from('article_search').upsert(
    {
      help_center_id: helpCenterId,
      article_id: articleId,
      title: effective.title,
      body_text: htmlToText(effective.bodyHtml),
      indexed_at: new Date().toISOString(),
    },
    { onConflict: 'help_center_id,article_id' },
  )

  if (error) throw new Error(`indexArticle failed: ${error.message}`)
}

/** Reindexes an article in every help center that publishes it. */
export async function reindexArticleEverywhere(articleId: string): Promise<void> {
  const { data, error } = await serviceClient()
    .from('help_center_articles')
    .select('help_center_id')
    .eq('article_id', articleId)

  if (error) throw new Error(`reindexArticleEverywhere failed: ${error.message}`)

  for (const row of data ?? []) {
    await indexArticle(row.help_center_id, articleId)
  }
}
