import Link from 'next/link'
import { getActiveHelpCenter, getBaseHelpCenterId } from '@/lib/tenancy/active'
import { getCachedArticleCounts, getCachedCollections } from '@/lib/content/cached'
import { tileGridClasses } from '@/lib/tenancy/theme'
import { SearchBox } from '@/components/public/search-box'

export default async function HomePage() {
  const [helpCenter, baseId] = await Promise.all([getActiveHelpCenter(), getBaseHelpCenterId()])
  const [collections, counts] = await Promise.all([
    getCachedCollections(baseId),
    getCachedArticleCounts(baseId),
  ])

  return (
    <>
      <section className="hc-hero px-5 py-16">
        <div className="mx-auto flex max-w-2xl flex-col items-center gap-6 text-center">
          <h1 className="text-3xl font-semibold sm:text-4xl">
            {helpCenter.settings.headline ?? 'How can we help?'}
          </h1>
          {helpCenter.settings.subtitle && (
            <p className="opacity-80">{helpCenter.settings.subtitle}</p>
          )}
          <SearchBox />
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-5 py-12">
        <ul className={`grid gap-4 ${tileGridClasses(helpCenter.tilesPerRow)}`}>
          {collections.map((collection) => (
            <li key={collection.id}>
              <Link
                href={`/${collection.slug}`}
                className="group block h-full rounded-xl border border-neutral-200 p-5 transition hover:border-[color:var(--hc-primary)] hover:shadow-sm"
              >
                {collection.icon && (
                  // Decorative: the title next to it already names the category,
                  // so announcing the emoji would just be noise for a screen reader.
                  <span aria-hidden="true" className="block text-2xl leading-none">
                    {collection.icon}
                  </span>
                )}
                <h2 className="mt-2 font-medium group-hover:text-[color:var(--hc-primary)]">
                  {collection.title}
                </h2>
                {collection.description && (
                  <p className="mt-1 text-sm text-neutral-600">{collection.description}</p>
                )}
                <p className="hc-secondary-muted mt-3 text-xs">
                  {counts[collection.id] ?? 0} articles
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
