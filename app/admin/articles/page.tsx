import Link from 'next/link'
import { serviceClient } from '@/lib/db/client'
import { createArticle } from './actions'

export default async function ArticlesPage() {
  const { data: articles } = await serviceClient()
    .from('articles')
    .select('id, title, slug, status, updated_at')
    .order('updated_at', { ascending: false })

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
        {(articles ?? []).length === 0 && (
          <li className="px-4 py-6 text-sm text-neutral-500">No articles yet.</li>
        )}
        {(articles ?? []).map((article) => (
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
    </div>
  )
}
