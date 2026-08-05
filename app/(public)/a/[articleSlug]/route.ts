import { redirect } from 'next/navigation'
import { getActiveHelpCenter, getBaseHelpCenterId, getBasePath } from '@/lib/tenancy/active'
import { getCachedArticle, getCachedCollections } from '@/lib/content/cached'
import { getExcludedArticleIds } from '@/lib/tenancy/exclusions'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ articleSlug: string }> },
) {
  const { articleSlug } = await params
  const [helpCenter, baseId, basePath] = await Promise.all([
    getActiveHelpCenter(),
    getBaseHelpCenterId(),
    getBasePath(),
  ])

  const [article, collections, excluded] = await Promise.all([
    getCachedArticle(baseId, articleSlug),
    getCachedCollections(baseId),
    getExcludedArticleIds(helpCenter.id),
  ])
  if (!article || excluded.has(article.id)) redirect(`${basePath}/`)

  const collection = collections.find((c) => c.id === article.collectionId)

  redirect(collection ? `${basePath}/${collection.slug}/${article.slug}` : `${basePath}/`)
}
