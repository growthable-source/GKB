import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getOwnedCenter } from '@/lib/dashboard/owned-center'
import { listOwnerCollections } from '@/lib/dashboard/owned-content'
import { getBaseHelpCenterId } from '@/lib/tenancy/active'
import { getExcludedArticleIds } from '@/lib/tenancy/exclusions'
import { getCachedArticleCollectionIndex, getCachedCollections } from '@/lib/content/cached'
import { summariseSharedSections } from '@/lib/dashboard/shared-sections'
import { createOwnerCollection, deleteOwnerCollection, setSharedSectionHidden } from './actions'
import { NewCollectionForm } from '@/components/dashboard/new-collection-form'

export const metadata = { title: 'Sections — Growthable' }

export default async function OwnerCollectionsPage() {
  const center = await getOwnedCenter()
  if (!center) redirect('/get/details')

  const baseId = await getBaseHelpCenterId()
  const [collections, sharedCollections, index, excluded] = await Promise.all([
    listOwnerCollections(center.id),
    getCachedCollections(baseId),
    getCachedArticleCollectionIndex(baseId),
    getExcludedArticleIds(center.id),
  ])
  const shared = summariseSharedSections(sharedCollections, index, excluded)

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-lg font-semibold">Your sections</h1>
        <p className="mt-1 text-sm text-neutral-600">
          Categories of your own, shown after the shared ones on your help centre. You can also
          file your articles into the shared categories instead.
        </p>
      </div>

      <NewCollectionForm action={createOwnerCollection} />

      {collections.length === 0 ? (
        <p className="rounded-lg border border-dashed border-neutral-300 p-6 text-center text-sm text-neutral-600">
          No sections of your own yet.
        </p>
      ) : (
        <ul className="divide-y divide-neutral-200 rounded-lg border border-neutral-200 bg-white">
          {collections.map((collection) => (
            <li key={collection.id} className="flex items-center justify-between gap-4 px-4 py-3">
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">
                  {collection.icon ? `${collection.icon} ` : ''}
                  {collection.title}
                </span>
                <span className="block text-xs text-neutral-500">
                  {collection.articleCount}{' '}
                  {collection.articleCount === 1 ? 'article' : 'articles'} · /{collection.slug}
                </span>
              </span>
              <form
                action={async () => {
                  'use server'
                  await deleteOwnerCollection(collection.id)
                }}
              >
                <button type="submit" className="cursor-pointer text-xs text-red-700 underline">
                  Delete
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}

      <p className="text-xs text-neutral-500">
        Deleting a section keeps its articles — they move to &ldquo;No section&rdquo; so you can
        re-file them.
      </p>

      <section className="flex flex-col gap-4">
        <div>
          <h2 className="text-lg font-semibold">Shared sections</h2>
          <p className="mt-1 text-sm text-neutral-600">
            The categories the shared library comes in. Hide a whole section if it doesn&rsquo;t
            apply to how you work, or browse it to hide articles one at a time.
          </p>
        </div>

        {shared.length === 0 ? (
          <p className="rounded-lg border border-dashed border-neutral-300 p-6 text-center text-sm text-neutral-600">
            The shared library has no sections yet.
          </p>
        ) : (
          <ul className="divide-y divide-neutral-200 rounded-lg border border-neutral-200 bg-white">
            {shared.map((section) => {
              const allHidden = section.hidden === section.total
              return (
                <li key={section.id} className="flex items-center justify-between gap-4 px-4 py-3">
                  <span className="min-w-0">
                    <span
                      className={`block truncate text-sm font-medium ${allHidden ? 'text-neutral-400' : ''}`}
                    >
                      {section.icon ? `${section.icon} ` : ''}
                      {section.title}
                    </span>
                    <span className="block text-xs text-neutral-500">
                      {section.total} {section.total === 1 ? 'article' : 'articles'}
                      {section.hidden > 0 &&
                        (allHidden ? ' · all hidden' : ` · ${section.hidden} hidden`)}
                      {' · '}
                      <Link
                        href={`/dashboard/articles?section=${section.id}`}
                        className="underline"
                      >
                        Browse
                      </Link>
                    </span>
                  </span>
                  <form
                    action={async () => {
                      'use server'
                      await setSharedSectionHidden(section.id, !allHidden)
                    }}
                  >
                    <button
                      type="submit"
                      className={`cursor-pointer whitespace-nowrap rounded-md border px-3 py-1.5 text-xs ${
                        allHidden
                          ? 'border-neutral-300 text-neutral-600'
                          : 'border-neutral-900 text-neutral-900'
                      }`}
                    >
                      {allHidden
                        ? 'Hidden — show it'
                        : section.hidden > 0
                          ? 'Hide the rest'
                          : 'Hide section'}
                    </button>
                  </form>
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </div>
  )
}
