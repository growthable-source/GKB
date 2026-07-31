import { redirect } from 'next/navigation'
import { getActiveHelpCenter } from '@/lib/tenancy/active'
import { getEffectiveArticle, listEffectiveCollections } from '@/lib/content/queries'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ articleSlug: string }> },
) {
  const { articleSlug } = await params
  const helpCenter = await getActiveHelpCenter()

  const article = await getEffectiveArticle(helpCenter.id, articleSlug)
  if (!article) redirect('/')

  const collections = await listEffectiveCollections(helpCenter.id)
  const collection = collections.find((c) => c.id === article.collectionId)

  redirect(collection ? `/${collection.slug}/${article.slug}` : '/')
}
