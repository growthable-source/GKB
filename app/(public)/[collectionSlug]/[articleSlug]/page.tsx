import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getActiveHelpCenter, getBaseHelpCenterId, getBasePath } from '@/lib/tenancy/active'
import { getExcludedArticleIds } from '@/lib/tenancy/exclusions'
import {
  getCachedArticle,
  getCachedArticlesInCollection,
  getCachedCollections,
  getCachedOwnedArticle,
  getCachedOwnedArticles,
  getCachedOwnedCollections,
} from '@/lib/content/cached'
import { addHeadingIds, extractHeadings } from '@/lib/content/toc'

export default async function ArticlePage({
  params,
}: {
  params: Promise<{ collectionSlug: string; articleSlug: string }>
}) {
  const { collectionSlug, articleSlug } = await params
  const [helpCenter, baseId, basePath] = await Promise.all([
    getActiveHelpCenter(),
    getBaseHelpCenterId(),
    getBasePath(),
  ])

  // The article and the collection list are independent; only the sibling list
  // depends on which collection the article resolves to.
  const ownerId = helpCenter.id === baseId ? null : helpCenter.id

  const [sharedArticle, ownedArticle, shared, owned, excluded] = await Promise.all([
    getCachedArticle(baseId, articleSlug),
    ownerId ? getCachedOwnedArticle(ownerId, articleSlug) : null,
    getCachedCollections(baseId),
    ownerId ? getCachedOwnedCollections(ownerId) : [],
    getExcludedArticleIds(helpCenter.id),
  ])

  // The centre's own article wins. Slugs are unique per owner, so a tenant may
  // hold one the shared library also uses — and on their help centre, theirs is
  // the one they published and expect to see.
  const article = ownedArticle ?? sharedArticle
  // Excluded means excluded however you arrive, not just from the listings.
  if (!article || excluded.has(article.id)) notFound()

  const collections = [...shared, ...owned]
  const collection = collections.find((c) => c.id === article.collectionId)
  if (!collection || collection.slug !== collectionSlug) notFound()

  const [allSiblings, ownedSiblings] = await Promise.all([
    getCachedArticlesInCollection(baseId, collection.id),
    ownerId ? getCachedOwnedArticles(ownerId, collection.id) : [],
  ])
  const siblings = [
    ...allSiblings.filter((sibling) => !excluded.has(sibling.id)),
    ...ownedSiblings,
  ]
  const index = siblings.findIndex((s) => s.id === article.id)
  const previous = index > 0 ? siblings[index - 1] : null
  const next = index >= 0 && index < siblings.length - 1 ? siblings[index + 1] : null

  const headings = extractHeadings(article.bodyHtml)
  const bodyHtml = addHeadingIds(article.bodyHtml, headings)

  return (
    <div className="mx-auto flex max-w-5xl gap-12 px-5 py-12">
      <article className="min-w-0 flex-1">
        <nav className="mb-6 text-sm text-neutral-500">
          <Link href={`${basePath}/`} className="hover:text-[color:var(--hc-primary)] hover:underline">
            All collections
          </Link>
          <span className="mx-2">/</span>
          <Link href={`${basePath}/${collection.slug}`} className="hover:text-[color:var(--hc-primary)] hover:underline">
            {collection.title}
          </Link>
        </nav>

        <h1 className="text-3xl font-semibold">{article.title}</h1>

        {/* Sanitized on save by sanitizeArticleHtml. */}
        <div
          className="prose prose-neutral mt-8 max-w-none"
          dangerouslySetInnerHTML={{ __html: bodyHtml }}
        />

        <div className="mt-16 flex justify-between gap-4 border-t border-neutral-200 pt-6 text-sm">
          {previous ? (
            <Link
              href={`${basePath}/${collection.slug}/${previous.slug}`}
              className="hover:text-[color:var(--hc-primary)] hover:underline"
            >
              ← {previous.title}
            </Link>
          ) : (
            <span />
          )}
          {next && (
            <Link
              href={`${basePath}/${collection.slug}/${next.slug}`}
              className="text-right hover:text-[color:var(--hc-primary)] hover:underline"
            >
              {next.title} →
            </Link>
          )}
        </div>
      </article>

      {headings.length > 1 && (
        <aside className="hidden w-56 shrink-0 lg:block">
          <div className="sticky top-8">
            <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
              On this page
            </p>
            <ul className="mt-3 space-y-2 text-sm">
              {headings.map((heading) => (
                <li key={heading.id} className={heading.level === 3 ? 'pl-3' : ''}>
                  <a
                    href={`#${heading.id}`}
                    className="text-neutral-600 hover:text-[color:var(--hc-primary)]"
                  >
                    {heading.text}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </aside>
      )}
    </div>
  )
}
