import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getOwnedCenter } from '@/lib/dashboard/owned-center'
import { listOwnerArticles, listOwnerCollections } from '@/lib/dashboard/owned-content'

export const metadata = { title: 'Your help centre — Growthable' }

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string }>
}) {
  const [center, { notice }] = await Promise.all([getOwnedCenter(), searchParams])
  if (!center) redirect('/get/details')

  const [articles, collections] = await Promise.all([
    listOwnerArticles(center.id),
    listOwnerCollections(center.id),
  ])

  const published = articles.filter((article) => article.status === 'published').length
  const drafts = articles.length - published
  const url = `/hc/${center.slug}`

  return (
    <div className="flex flex-col gap-8">
      {notice && (
        <p className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {notice}
        </p>
      )}

      <section className="rounded-lg border border-neutral-200 bg-white p-5">
        <p className="text-xs uppercase tracking-wide text-neutral-500">Your help centre is live</p>
        <a
          href={url}
          className="mt-1 block font-mono text-lg text-neutral-900 underline decoration-neutral-300 underline-offset-4 hover:decoration-neutral-900"
        >
          {url}
        </a>
        <p className="mt-3 text-sm text-neutral-600">
          Every published GoHighLevel article is already in there. Anything you add below appears
          alongside them.
        </p>
      </section>

      <section className="grid gap-4 sm:grid-cols-3">
        {[
          { label: 'Your published articles', value: published, href: '/dashboard/articles' },
          { label: 'Your drafts', value: drafts, href: '/dashboard/articles' },
          { label: 'Your sections', value: collections.length, href: '/dashboard/collections' },
        ].map((tile) => (
          <Link
            key={tile.label}
            href={tile.href}
            className="rounded-lg border border-neutral-200 bg-white p-5 transition hover:border-neutral-400"
          >
            <p className="text-2xl font-semibold tabular-nums">{tile.value}</p>
            <p className="mt-1 text-sm text-neutral-600">{tile.label}</p>
          </Link>
        ))}
      </section>

      <section>
        <h2 className="text-lg font-semibold">Recently edited</h2>
        {articles.length === 0 ? (
          <p className="mt-2 text-sm text-neutral-600">
            You haven&rsquo;t written anything yet.{' '}
            <Link href="/dashboard/articles" className="underline">
              Write your first article
            </Link>
            .
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-neutral-200 rounded-lg border border-neutral-200 bg-white">
            {articles.slice(0, 5).map((article) => (
              <li key={article.id}>
                <Link
                  href={`/dashboard/articles/${article.id}`}
                  className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-neutral-50"
                >
                  <span className="min-w-0 truncate text-sm">{article.title}</span>
                  <span className="shrink-0 text-xs text-neutral-500">
                    {article.status === 'published' ? 'Published' : 'Draft'}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
