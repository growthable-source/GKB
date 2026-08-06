import { redirect } from 'next/navigation'
import { getOwnedCenter } from '@/lib/dashboard/owned-center'
import { listOwnerCollections } from '@/lib/dashboard/owned-content'
import { createOwnerCollection, deleteOwnerCollection } from './actions'
import { NewCollectionForm } from '@/components/dashboard/new-collection-form'

export const metadata = { title: 'Sections — Growthable' }

export default async function OwnerCollectionsPage() {
  const center = await getOwnedCenter()
  if (!center) redirect('/get/details')

  const collections = await listOwnerCollections(center.id)

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
    </div>
  )
}
