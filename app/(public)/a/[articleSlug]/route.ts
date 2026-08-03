import { redirect } from 'next/navigation'
import { getBaseHelpCenterId } from '@/lib/tenancy/active'
import { getCachedArticle, getCachedCollections } from '@/lib/content/cached'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ articleSlug: string }> },
) {
  const { articleSlug } = await params
  const baseId = await getBaseHelpCenterId()

  const [article, collections] = await Promise.all([
    getCachedArticle(baseId, articleSlug),
    getCachedCollections(baseId),
  ])
  if (!article) redirect('/')

  const collection = collections.find((c) => c.id === article.collectionId)

  redirect(collection ? `/${collection.slug}/${article.slug}` : '/')
}
