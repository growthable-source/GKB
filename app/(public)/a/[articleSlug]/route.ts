import { redirect } from 'next/navigation'
import { getBaseHelpCenterId } from '@/lib/tenancy/active'
import { getEffectiveArticle, listEffectiveCollections } from '@/lib/content/queries'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ articleSlug: string }> },
) {
  const { articleSlug } = await params
  const baseId = await getBaseHelpCenterId()

  const article = await getEffectiveArticle(baseId, articleSlug)
  if (!article) redirect('/')

  const collections = await listEffectiveCollections(baseId)
  const collection = collections.find((c) => c.id === article.collectionId)

  redirect(collection ? `/${collection.slug}/${article.slug}` : '/')
}
