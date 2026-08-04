import { listEffectiveCollections } from '@/lib/content/queries'
import { getBaseHelpCenterId } from '@/lib/tenancy/active'
import { createCollection, deleteCollection, updateCollection } from './actions'

export default async function CollectionsPage() {
  const baseId = await getBaseHelpCenterId()
  const collections = await listEffectiveCollections(baseId)

  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-2xl font-semibold">Collections</h1>

      <form action={createCollection} className="flex flex-wrap gap-3 rounded-lg border border-neutral-200 bg-white p-4">
        <input
          name="title"
          required
          placeholder="Collection title"
          className="min-w-48 flex-1 rounded-md border border-neutral-300 px-3 py-2"
        />
        <input
          name="description"
          placeholder="Short description"
          className="min-w-48 flex-1 rounded-md border border-neutral-300 px-3 py-2"
        />
        <button type="submit" className="rounded-md bg-neutral-900 px-4 py-2 text-white">
          Add collection
        </button>
      </form>

      <ul className="divide-y divide-neutral-200 rounded-lg border border-neutral-200 bg-white">
        {collections.length === 0 && (
          <li className="px-4 py-6 text-sm text-neutral-500">No collections yet.</li>
        )}
        {collections.map((collection) => (
          <li key={collection.id} className="flex items-center justify-between gap-4 px-4 py-3">
            <div className="flex items-center gap-3">
              <form action={updateCollection} className="flex items-center gap-1">
                <input type="hidden" name="id" value={collection.id} />
                <input
                  name="icon"
                  defaultValue={collection.icon ?? ''}
                  placeholder="🙂"
                  aria-label={`Emoji for ${collection.title}`}
                  className="w-12 rounded-md border border-neutral-300 px-2 py-1 text-center text-lg"
                />
                <button type="submit" className="text-xs text-neutral-500 hover:underline">
                  Save
                </button>
              </form>
              <div>
                <p className="font-medium">{collection.title}</p>
                <p className="text-sm text-neutral-500">/{collection.slug}</p>
              </div>
            </div>
            <form action={deleteCollection}>
              <input type="hidden" name="id" value={collection.id} />
              <button type="submit" className="text-sm text-red-600 hover:underline">
                Delete
              </button>
            </form>
          </li>
        ))}
      </ul>
    </div>
  )
}
