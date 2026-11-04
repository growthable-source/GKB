import Link from 'next/link'
import { redirect } from 'next/navigation'
import { serviceClient } from '@/lib/db/client'
import { getBaseHelpCenterId } from '@/lib/tenancy/active'
import { getExcludedArticleIds } from '@/lib/tenancy/exclusions'
import { getOwnedCenter } from '@/lib/dashboard/owned-center'
import { listOwnerArticles, listOwnerCollections } from '@/lib/dashboard/owned-content'
import { getCachedArticlesInCollection, getCachedCollections } from '@/lib/content/cached'
import { setSharedSectionHidden } from '../collections/actions'
import { createOwnerArticle, setSharedArticleHidden } from './actions'

export const metadata = { title: 'Articles — Growthable' }

const PAGE_SIZE = 20

/**
 * The shared library, one page at a time.
 *
 * 2,739 rows is far too many to render, so this is searched and paginated
 * rather than listed. It reads the base centre's placements, which is the same
 * source the public pages read, so what is listed here is exactly what a
 * visitor could see.
 */
type SharedRow = { id: string; title: string; slug: string; collectionId: string | null }

async function sharedLibraryPage(
  baseId: string,
  query: string,
  page: number,
): Promise<{ rows: SharedRow[]; total: number }> {
  const from = page * PAGE_SIZE

  let request = serviceClient()
    .from('help_center_articles')
    .select(
      'article_id, collection_override_id, articles!inner (id, title, slug, status, collection_id)',
      { count: 'exact' },
    )
    .eq('help_center_id', baseId)
    .eq('is_hidden', false)
    .eq('articles.status', 'published')

  if (query) request = request.ilike('articles.title', `%${query}%`)

  const { data, error, count } = await request
    .order('article_id', { ascending: true })
    .range(from, from + PAGE_SIZE - 1)

  if (error) throw new Error(`Could not load the shared library: ${error.message}`)

  const rows = (data ?? []).map((row) => {
    const article = row.articles as unknown as {
      id: string
      title: string
      slug: string
      collection_id: string | null
    }
    return {
      id: article.id,
      title: article.title,
      slug: article.slug,
      // Same precedence the public pages use: a placement override wins.
      collectionId: row.collection_override_id ?? article.collection_id,
    }
  })

  return { rows, total: count ?? 0 }
}

/**
 * One shared section, searched and paginated in memory.
 *
 * A section is at most a few hundred articles and its list is already cached
 * for the public section page, so reusing that is cheaper and simpler than a
 * second pair of override/canonical queries (see listEffectiveArticles).
 */
async function sharedSectionPage(
  baseId: string,
  sectionId: string,
  query: string,
  page: number,
): Promise<{ rows: SharedRow[]; total: number; allIds: string[] }> {
  const all = await getCachedArticlesInCollection(baseId, sectionId)
  const needle = query.toLowerCase()
  const matching = needle ? all.filter((a) => a.title.toLowerCase().includes(needle)) : all
  const rows = matching
    .slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
    .map((a) => ({ id: a.id, title: a.title, slug: a.slug, collectionId: a.collectionId }))
  return { rows, total: matching.length, allIds: all.map((a) => a.id) }
}

export default async function DashboardArticlesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string; section?: string }>
}) {
  const [center, params] = await Promise.all([getOwnedCenter(), searchParams])
  if (!center) redirect('/get/details')

  const query = (params.q ?? '').trim()
  const page = Math.max(0, Number(params.page ?? '0') || 0)
  const baseId = await getBaseHelpCenterId()

  const sharedCollections = await getCachedCollections(baseId)
  // Only a real shared section filters; anything else in the URL is ignored.
  const section = sharedCollections.find((c) => c.id === params.section) ?? null

  const sharedPage: Promise<{ rows: SharedRow[]; total: number; allIds?: string[] }> = section
    ? sharedSectionPage(baseId, section.id, query, page)
    : sharedLibraryPage(baseId, query, page)

  const [own, collections, excluded, shared] = await Promise.all([
    listOwnerArticles(center.id),
    listOwnerCollections(center.id),
    getExcludedArticleIds(center.id),
    sharedPage,
  ])

  const collectionTitle = new Map(
    [...sharedCollections, ...collections].map((c) => [c.id, c.title]),
  )
  const lastPage = Math.max(0, Math.ceil(shared.total / PAGE_SIZE) - 1)
  const pageHref = (target: number) =>
    `/dashboard/articles?q=${encodeURIComponent(query)}${
      section ? `&section=${section.id}` : ''
    }&page=${target}`
  // Judged over the whole section, not just the page on screen.
  const sectionIds = shared.allIds ?? []
  const sectionAllHidden = sectionIds.length > 0 && sectionIds.every((id) => excluded.has(id))

  return (
    <div className="flex flex-col gap-10">
      <section>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold">Your articles</h1>
            <p className="mt-1 text-sm text-neutral-600">
              Articles you write appear on your help centre alongside the shared library.
            </p>
          </div>
          <form action={createOwnerArticle}>
            <button
              type="submit"
              className="cursor-pointer rounded-md bg-neutral-900 px-4 py-2 text-sm text-white"
            >
              New article
            </button>
          </form>
        </div>

        {own.length === 0 ? (
          <p className="mt-4 rounded-lg border border-dashed border-neutral-300 p-6 text-center text-sm text-neutral-600">
            Nothing yet. Your clients see the shared library until you add something of your own.
          </p>
        ) : (
          <ul className="mt-4 divide-y divide-neutral-200 rounded-lg border border-neutral-200 bg-white">
            {own.map((article) => (
              <li key={article.id}>
                <Link
                  href={`/dashboard/articles/${article.id}`}
                  className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-neutral-50"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{article.title}</span>
                    <span className="block text-xs text-neutral-500">
                      {article.collectionId
                        ? (collectionTitle.get(article.collectionId) ?? 'Shared section')
                        : 'No section'}
                    </span>
                  </span>
                  <span
                    className={`shrink-0 rounded-full px-2.5 py-1 text-xs ${
                      article.status === 'published'
                        ? 'bg-green-100 text-green-800'
                        : 'bg-neutral-200 text-neutral-700'
                    }`}
                  >
                    {article.status === 'published' ? 'Published' : 'Draft'}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="text-lg font-semibold">The shared library</h2>
        <p className="mt-1 text-sm text-neutral-600">
          {/* The count follows the filter, so it must not claim to be the whole
              library while a search is narrowing it. */}
          {query
            ? `${shared.total.toLocaleString()} matching "${query}"${section ? ` in ${section.title}` : ''}.`
            : section
              ? `${shared.total.toLocaleString()} articles in ${section.title}.`
              : `${shared.total.toLocaleString()} articles we write and keep current.`}{' '}
          You can&rsquo;t edit them, but you can hide any that don&rsquo;t apply to how you work,
          one at a time or a whole section from{' '}
          <Link href="/dashboard/collections" className="underline">
            Sections
          </Link>
          .
        </p>

        <form method="get" className="mt-4 flex flex-wrap gap-2">
          <select
            name="section"
            defaultValue={section?.id ?? ''}
            aria-label="Section"
            className="max-w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
          >
            <option value="">All sections</option>
            {sharedCollections.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </select>
          <input
            name="q"
            defaultValue={query}
            placeholder="Search the shared library…"
            className="min-w-0 flex-1 rounded-md border border-neutral-300 px-3 py-2 text-sm"
          />
          <button
            type="submit"
            className="cursor-pointer rounded-md border border-neutral-300 px-4 py-2 text-sm"
          >
            Search
          </button>
        </form>

        {section && sectionIds.length > 0 && (
          <form
            className="mt-3"
            action={async () => {
              'use server'
              await setSharedSectionHidden(section.id, !sectionAllHidden)
            }}
          >
            <button type="submit" className="cursor-pointer text-sm underline">
              {sectionAllHidden
                ? `Show every article in ${section.title}`
                : `Hide every article in ${section.title}`}
            </button>
          </form>
        )}

        <ul className="mt-4 divide-y divide-neutral-200 rounded-lg border border-neutral-200 bg-white">
          {shared.rows.length === 0 && (
            <li className="px-4 py-6 text-center text-sm text-neutral-500">
              {query ? <>Nothing matched &ldquo;{query}&rdquo;.</> : 'Nothing here.'}
            </li>
          )}
          {shared.rows.map((article) => {
            const hidden = excluded.has(article.id)
            return (
              <li key={article.id} className="flex items-center justify-between gap-4 px-4 py-3">
                <span className="min-w-0">
                  <span
                    className={`block truncate text-sm ${hidden ? 'text-neutral-400' : ''}`}
                  >
                    {article.title}
                  </span>
                  {!section && (
                    <span className="block truncate text-xs text-neutral-500">
                      {(article.collectionId && collectionTitle.get(article.collectionId)) ||
                        'No section'}
                    </span>
                  )}
                </span>
                <form
                  action={async () => {
                    'use server'
                    await setSharedArticleHidden(article.id, !hidden)
                  }}
                >
                  <button
                    type="submit"
                    className={`cursor-pointer rounded-md border px-3 py-1.5 text-xs ${
                      hidden
                        ? 'border-neutral-300 text-neutral-600'
                        : 'border-neutral-900 text-neutral-900'
                    }`}
                  >
                    {hidden ? 'Hidden — show it' : 'Hide'}
                  </button>
                </form>
              </li>
            )
          })}
        </ul>

        {lastPage > 0 && (
          <div className="mt-4 flex items-center justify-between text-sm">
            <Link
              href={pageHref(Math.max(0, page - 1))}
              className={`underline ${page === 0 ? 'pointer-events-none opacity-40' : ''}`}
            >
              Previous
            </Link>
            <span className="text-neutral-500">
              Page {page + 1} of {lastPage + 1}
            </span>
            <Link
              href={pageHref(Math.min(lastPage, page + 1))}
              className={`underline ${page >= lastPage ? 'pointer-events-none opacity-40' : ''}`}
            >
              Next
            </Link>
          </div>
        )}
      </section>
    </div>
  )
}
