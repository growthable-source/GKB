import { redirect } from 'next/navigation'
import { getActiveHelpCenter, getBaseHelpCenterId, getBasePath } from '@/lib/tenancy/active'
import {
  getCachedArticle,
  getCachedCollections,
  getCachedOwnedArticle,
  getCachedOwnedCollections,
} from '@/lib/content/cached'
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

  const ownerId = helpCenter.id === baseId ? null : helpCenter.id

  const [sharedArticle, ownedArticle, shared, owned, excluded] = await Promise.all([
    getCachedArticle(baseId, articleSlug),
    ownerId ? getCachedOwnedArticle(ownerId, articleSlug) : null,
    getCachedCollections(baseId),
    ownerId ? getCachedOwnedCollections(ownerId) : [],
    getExcludedArticleIds(helpCenter.id),
  ])

  // Their own wins, same precedence as the article page.
  const article = ownedArticle ?? sharedArticle
  if (!article || excluded.has(article.id)) redirect(`${basePath}/`)

  const collection = [...shared, ...owned].find((c) => c.id === article.collectionId)

  redirect(collection ? `${basePath}/${collection.slug}/${article.slug}` : `${basePath}/`)
}
