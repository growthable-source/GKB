import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getActiveHelpCenter } from '@/lib/tenancy/active'
import {
  getEffectiveArticle,
  listEffectiveArticles,
  listEffectiveCollections,
} from '@/lib/content/queries'
import { addHeadingIds, extractHeadings } from '@/lib/content/toc'

export default async function ArticlePage({
  params,
}: {
  params: Promise<{ collectionSlug: string; articleSlug: string }>
}) {
  const { collectionSlug, articleSlug } = await params
  const helpCenter = await getActiveHelpCenter()

  const article = await getEffectiveArticle(helpCenter.id, articleSlug)
  if (!article) notFound()

  const collections = await listEffectiveCollections(helpCenter.id)
  const collection = collections.find((c) => c.id === article.collectionId)
  if (!collection || collection.slug !== collectionSlug) notFound()

  const siblings = await listEffectiveArticles(helpCenter.id, collection.id)
  const index = siblings.findIndex((s) => s.id === article.id)
  const previous = index > 0 ? siblings[index - 1] : null
  const next = index >= 0 && index < siblings.length - 1 ? siblings[index + 1] : null

  const headings = extractHeadings(article.bodyHtml)
  const bodyHtml = addHeadingIds(article.bodyHtml, headings)

  return (
    <div className="mx-auto flex max-w-5xl gap-12 px-5 py-12">
      <article className="min-w-0 flex-1">
        <nav className="mb-6 text-sm text-neutral-500">
          <Link href="/" className="hover:text-[color:var(--hc-primary)] hover:underline">
            All collections
          </Link>
          <span className="mx-2">/</span>
          <Link href={`/${collection.slug}`} className="hover:text-[color:var(--hc-primary)] hover:underline">
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
              href={`/${collection.slug}/${previous.slug}`}
              className="hover:text-[color:var(--hc-primary)] hover:underline"
            >
              ← {previous.title}
            </Link>
          ) : (
            <span />
          )}
          {next && (
            <Link
              href={`/${collection.slug}/${next.slug}`}
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
