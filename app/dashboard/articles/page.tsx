import Link from 'next/link'
import { redirect } from 'next/navigation'
import { serviceClient } from '@/lib/db/client'
import { getBaseHelpCenterId } from '@/lib/tenancy/active'
import { getExcludedArticleIds } from '@/lib/tenancy/exclusions'
import { getOwnedCenter } from '@/lib/dashboard/owned-center'
import { listOwnerArticles, listOwnerCollections } from '@/lib/dashboard/owned-content'
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
async function sharedLibraryPage(baseId: string, query: string, page: number) {
  const from = page * PAGE_SIZE

  let request = serviceClient()
    .from('help_center_articles')
    .select('article_id, articles!inner (id, title, slug, status)', { count: 'exact' })
    .eq('help_center_id', baseId)
    .eq('is_hidden', false)
    .eq('articles.status', 'published')

  if (query) request = request.ilike('articles.title', `%${query}%`)

  const { data, error, count } = await request
    .order('article_id', { ascending: true })
    .range(from, from + PAGE_SIZE - 1)

  if (error) throw new Error(`Could not load the shared library: ${error.message}`)

  const rows = (data ?? []).map((row) => {
    const article = row.articles as unknown as { id: string; title: string; slug: string }
    return { id: article.id, title: article.title, slug: article.slug }
  })

  return { rows, total: count ?? 0 }
}

export default async function DashboardArticlesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>
}) {
  const [center, params] = await Promise.all([getOwnedCenter(), searchParams])
  if (!center) redirect('/get/details')

  const query = (params.q ?? '').trim()
  const page = Math.max(0, Number(params.page ?? '0') || 0)
  const baseId = await getBaseHelpCenterId()

  const [own, collections, excluded, shared] = await Promise.all([
    listOwnerArticles(center.id),
    listOwnerCollections(center.id),
    getExcludedArticleIds(center.id),
    sharedLibraryPage(baseId, query, page),
  ])

  const collectionTitle = new Map(collections.map((c) => [c.id, c.title]))
  const lastPage = Math.max(0, Math.ceil(shared.total / PAGE_SIZE) - 1)

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
            ? `${shared.total.toLocaleString()} matching "${query}".`
            : `${shared.total.toLocaleString()} articles we write and keep current.`}{' '}
          You can&rsquo;t edit them, but you can hide any that don&rsquo;t apply to how you work.
        </p>

        <form method="get" className="mt-4 flex gap-2">
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

        <ul className="mt-4 divide-y divide-neutral-200 rounded-lg border border-neutral-200 bg-white">
          {shared.rows.length === 0 && (
            <li className="px-4 py-6 text-center text-sm text-neutral-500">
              Nothing matched &ldquo;{query}&rdquo;.
            </li>
          )}
          {shared.rows.map((article) => {
            const hidden = excluded.has(article.id)
            return (
              <li key={article.id} className="flex items-center justify-between gap-4 px-4 py-3">
                <span className={`min-w-0 truncate text-sm ${hidden ? 'text-neutral-400' : ''}`}>
                  {article.title}
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
              href={`/dashboard/articles?q=${encodeURIComponent(query)}&page=${Math.max(0, page - 1)}`}
              className={`underline ${page === 0 ? 'pointer-events-none opacity-40' : ''}`}
            >
              Previous
            </Link>
            <span className="text-neutral-500">
              Page {page + 1} of {lastPage + 1}
            </span>
            <Link
              href={`/dashboard/articles?q=${encodeURIComponent(query)}&page=${Math.min(lastPage, page + 1)}`}
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
