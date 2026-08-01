import Link from 'next/link'
import { getActiveHelpCenter } from '@/lib/tenancy/active'
import { countArticlesPerCollection, listEffectiveCollections } from '@/lib/content/queries'
import { SearchBox } from '@/components/public/search-box'

export default async function HomePage() {
  const helpCenter = await getActiveHelpCenter()
  const collections = await listEffectiveCollections(helpCenter.id)
  const counts = await countArticlesPerCollection(helpCenter.id)

  return (
    <>
      <section className="border-b border-neutral-200 bg-neutral-50 px-5 py-16">
        <div className="mx-auto flex max-w-2xl flex-col items-center gap-6 text-center">
          <h1 className="text-3xl font-semibold sm:text-4xl">
            {helpCenter.settings.headline ?? 'How can we help?'}
          </h1>
          {helpCenter.settings.subtitle && (
            <p className="text-neutral-600">{helpCenter.settings.subtitle}</p>
          )}
          <SearchBox />
        </div>
      </section>

      <section className="mx-auto max-w-4xl px-5 py-12">
        <ul className="grid gap-4 sm:grid-cols-2">
          {collections.map((collection) => (
            <li key={collection.id}>
              <Link
                href={`/${collection.slug}`}
                className="block h-full rounded-xl border border-neutral-200 p-5 transition hover:border-neutral-400 hover:shadow-sm"
              >
                <h2 className="font-medium">{collection.title}</h2>
                {collection.description && (
                  <p className="mt-1 text-sm text-neutral-600">{collection.description}</p>
                )}
                <p className="mt-3 text-xs text-neutral-500">
                  {counts.get(collection.id) ?? 0} articles
                </p>
              </Link>
            </li>
          ))}
        </ul>
        {collections.length === 0 && (
          <p className="text-sm text-neutral-500">No collections published yet.</p>
        )}
      </section>
    </>
  )
}
