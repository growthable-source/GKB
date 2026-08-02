import Link from 'next/link'
import { getActiveHelpCenter } from '@/lib/tenancy/active'
import { searchHelpCenter } from '@/lib/search/search'
import { SearchBox } from '@/components/public/search-box'

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>
}) {
  const { q = '' } = await searchParams
  const helpCenter = await getActiveHelpCenter()
  const hits = q.trim() ? await searchHelpCenter(helpCenter.id, q, 30) : []

  return (
    <div className="mx-auto max-w-3xl px-5 py-12">
      <SearchBox autoFocus />

      {q.trim() && (
        <p className="mt-6 text-sm text-neutral-500">
          {hits.length} {hits.length === 1 ? 'result' : 'results'} for “{q}”
        </p>
      )}

      <ul className="mt-4 divide-y divide-neutral-200 border-t border-neutral-200">
        {hits.map((hit) => (
          <li key={hit.articleId} className="py-4">
            <Link href={`/a/${hit.slug}`} className="group block">
              <h2 className="font-medium group-hover:text-[color:var(--hc-primary)] group-hover:underline">
                {hit.title}
              </h2>
              <p
                className="mt-1 text-sm text-neutral-600"
                // ts_headline over sanitized text; only <mark> is added.
                dangerouslySetInnerHTML={{ __html: hit.headline }}
              />
            </Link>
          </li>
        ))}
      </ul>

      {q.trim() && hits.length === 0 && (
        <p className="mt-4 text-sm text-neutral-500">
          Nothing matched. Try different words.
        </p>
      )}
    </div>
  )
}
