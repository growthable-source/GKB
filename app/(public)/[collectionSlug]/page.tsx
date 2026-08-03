import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getBaseHelpCenterId } from '@/lib/tenancy/active'
import { getCachedArticlesInCollection, getCachedCollections } from '@/lib/content/cached'

export default async function CollectionPage({
  params,
}: {
  params: Promise<{ collectionSlug: string }>
}) {
  const { collectionSlug } = await params
  const baseId = await getBaseHelpCenterId()

  const collections = await getCachedCollections(baseId)
  const collection = collections.find((c) => c.slug === collectionSlug)
  if (!collection) notFound()

  const articles = await getCachedArticlesInCollection(baseId, collection.id)

  return (
    <div className="mx-auto max-w-3xl px-5 py-12">
      <nav className="mb-6 text-sm text-neutral-500">
        <Link href="/" className="hover:text-[color:var(--hc-primary)] hover:underline">
          All collections
        </Link>
        <span className="mx-2">/</span>
        <span>{collection.title}</span>
      </nav>

      <h1 className="text-3xl font-semibold">{collection.title}</h1>
      {collection.description && (
        <p className="mt-2 text-neutral-600">{collection.description}</p>
      )}

      <ul className="mt-8 divide-y divide-neutral-200 border-t border-neutral-200">
        {articles.length === 0 && (
          <li className="py-6 text-sm text-neutral-500">No articles in this collection yet.</li>
        )}
        {articles.map((article) => (
          <li key={article.id} className="py-4">
            <Link href={`/${collection.slug}/${article.slug}`} className="group block">
              <h2 className="font-medium group-hover:underline">{article.title}</h2>
              {article.excerpt && (
                <p className="mt-1 line-clamp-2 text-sm text-neutral-600">{article.excerpt}</p>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
