import { redirect } from 'next/navigation'
import { getActiveHelpCenter, getBaseHelpCenterId } from '@/lib/tenancy/active'
import { getCachedArticle, getCachedCollections } from '@/lib/content/cached'
import { getExcludedArticleIds } from '@/lib/tenancy/exclusions'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ articleSlug: string }> },
) {
  const { articleSlug } = await params
  const [helpCenter, baseId] = await Promise.all([getActiveHelpCenter(), getBaseHelpCenterId()])

  const [article, collections, excluded] = await Promise.all([
    getCachedArticle(baseId, articleSlug),
    getCachedCollections(baseId),
    getExcludedArticleIds(helpCenter.id),
  ])
  if (!article || excluded.has(article.id)) redirect('/')

  const collection = collections.find((c) => c.id === article.collectionId)

  redirect(collection ? `/${collection.slug}/${article.slug}` : '/')
}
