import Link from 'next/link'
import { serviceClient } from '@/lib/db/client'
import { createArticle } from './actions'

/** Most-recently-edited articles shown per page. */
const PAGE_SIZE = 100

export default async function ArticlesPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>
}) {
  const { page } = await searchParams
  const pageNumber = Math.max(1, Number(page) || 1)
  const from = (pageNumber - 1) * PAGE_SIZE

  // One page, not the whole catalog: this list is an editor's recent-work view,
  // and paging every article through it cost three round trips and ~700KB.
  const { data, count, error } = await serviceClient()
    .from('articles')
    .select('id, title, slug, status, updated_at', { count: 'exact' })
    // updated_at alone isn't guaranteed unique (ties are possible), and stable
    // .range() pagination needs a fully-unique order — id (the PK) breaks ties
    // deterministically.
    .order('updated_at', { ascending: false })
    .order('id', { ascending: true })
    .range(from, from + PAGE_SIZE - 1)

  if (error) throw new Error(`articles query failed: ${error.message}`)

  const articles = data ?? []
  const hasNext = count !== null && from + PAGE_SIZE < count

  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Articles</h1>
        <form action={createArticle}>
          <button type="submit" className="rounded-md bg-neutral-900 px-4 py-2 text-sm text-white">
            New article
          </button>
        </form>
      </div>

      <ul className="divide-y divide-neutral-200 rounded-lg border border-neutral-200 bg-white">
        {articles.length === 0 && (
          <li className="px-4 py-6 text-sm text-neutral-500">No articles yet.</li>
        )}
        {articles.map((article) => (
          <li key={article.id} className="flex items-center justify-between px-4 py-3">
            <Link href={`/admin/articles/${article.id}`} className="font-medium hover:underline">
              {article.title}
            </Link>
            <span className="text-xs uppercase tracking-wide text-neutral-500">
              {article.status}
            </span>
          </li>
        ))}
      </ul>

      <div className="flex items-center justify-between text-sm">
        {pageNumber > 1 ? (
          <Link href={`/admin/articles?page=${pageNumber - 1}`} className="hover:underline">
            ← Newer
          </Link>
        ) : (
          <span />
        )}
        <span className="text-neutral-500">
          {count ?? 0} articles · page {pageNumber}
        </span>
        {hasNext ? (
          <Link href={`/admin/articles?page=${pageNumber + 1}`} className="hover:underline">
            Older →
          </Link>
        ) : (
          <span />
        )}
      </div>
    </div>
  )
}
