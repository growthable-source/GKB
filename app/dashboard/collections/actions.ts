'use server'

import { revalidatePath, updateTag } from 'next/cache'
import { CONTENT_ARTICLES_TAG, CONTENT_COLLECTIONS_TAG, EXCLUSIONS_TAG } from '@/lib/cache/tags'
import { serviceClient } from '@/lib/db/client'
import { authorize } from '@/lib/authz/authorize'
import { slugify } from '@/lib/content/slug'
import { nextAvailableSlug } from '@/lib/content/unique-slug'
import { getOwnedCenter } from '@/lib/dashboard/owned-center'
import { assertOwnsCollection } from '@/lib/dashboard/owned-content'
import { pushKnowledgeRefresh } from '@/lib/ai-widget/knowledge-push'
import { getBaseHelpCenterId } from '@/lib/tenancy/active'
import { listArticleCollectionIndex, listEffectiveCollections } from '@/lib/content/queries'
import { articleIdsInSection } from '@/lib/dashboard/shared-sections'

export type CollectionState = { error?: string }

async function ownedCenter() {
  const center = await getOwnedCenter()
  if (!center) throw new Error('You do not have a help centre yet.')
  await authorize('helpCenter.update', { helpCenterId: center.id })
  return center
}

function bust() {
  updateTag(CONTENT_COLLECTIONS_TAG)
  updateTag(CONTENT_ARTICLES_TAG)
  revalidatePath('/dashboard/collections')
}

export async function createOwnerCollection(
  _prev: CollectionState | null,
  formData: FormData,
): Promise<CollectionState> {
  const center = await ownedCenter()

  const title = String(formData.get('title') ?? '').trim()
  if (!title) return { error: 'Give the section a name.' }

  const icon = String(formData.get('icon') ?? '').trim() || null
  const description = String(formData.get('description') ?? '').trim() || null
  const slug = await nextAvailableSlug('collections', slugify(title), { ownerId: center.id })

  const { error } = await serviceClient().from('collections').insert({
    title,
    slug,
    description,
    icon,
    origin_help_center_id: center.id,
  })

  if (error) return { error: `Could not create the section: ${error.message}` }

  bust()
  return {}
}

export async function renameOwnerCollection(
  _prev: CollectionState | null,
  formData: FormData,
): Promise<CollectionState> {
  const center = await ownedCenter()

  const id = String(formData.get('id') ?? '')
  const title = String(formData.get('title') ?? '').trim()
  if (!id) return { error: 'Missing section.' }
  if (!title) return { error: 'Give the section a name.' }

  await assertOwnsCollection(center.id, id)

  const { error } = await serviceClient()
    .from('collections')
    .update({
      title,
      description: String(formData.get('description') ?? '').trim() || null,
      icon: String(formData.get('icon') ?? '').trim() || null,
    })
    .eq('id', id)

  if (error) return { error: `Could not rename the section: ${error.message}` }

  bust()
  await pushKnowledgeRefresh(center.id)
  return {}
}

/**
 * Deletes one of the centre's own sections.
 *
 * Articles in it survive with no collection rather than being deleted with it.
 * Losing an article because a section was tidied up is not recoverable from
 * this UI, and the dashboard shows the orphans so they can be re-filed.
 */
export async function deleteOwnerCollection(collectionId: string): Promise<void> {
  const center = await ownedCenter()
  await assertOwnsCollection(center.id, collectionId)

  const db = serviceClient()

  const { error: detachError } = await db
    .from('articles')
    .update({ collection_id: null })
    .eq('collection_id', collectionId)
    .eq('origin_help_center_id', center.id)
  if (detachError) throw new Error(`Could not empty the section: ${detachError.message}`)

  const { error } = await db.from('collections').delete().eq('id', collectionId)
  if (error) throw new Error(`Could not delete the section: ${error.message}`)

  bust()
  await pushKnowledgeRefresh(center.id)
}

/** Rows per write. Keeps a delete's `in.(...)` filter well inside URL limits. */
const EXCLUSION_CHUNK = 100

/**
 * Hides or shows every article in one SHARED section on this centre.
 *
 * Writes the same per-article exclusion rows the single-article Hide button
 * does, so every public read (home tiles, section pages, articles, search, the
 * AI widget crawl) already respects it with no new filter anywhere. Showing a
 * section clears all of its exclusions, including ones hidden one by one.
 *
 * Reads the UNCACHED index: a mutation must never be fed by a stale cache. An
 * article the library adds to a hidden section later is visible until the
 * section is hidden again; the Sections page shows it as "N of M hidden".
 */
export async function setSharedSectionHidden(
  collectionId: string,
  hidden: boolean,
): Promise<void> {
  const center = await getOwnedCenter()
  if (!center) throw new Error('You do not have a help centre yet.')
  // The same permission as hiding one shared article: this is that, in bulk.
  await authorize('article.update', { helpCenterId: center.id })

  const baseId = await getBaseHelpCenterId()
  const [collections, index] = await Promise.all([
    listEffectiveCollections(baseId),
    listArticleCollectionIndex(baseId),
  ])
  // Only a published shared section can be hidden this way; an id the client
  // made up, or one of the centre's own sections, does nothing.
  if (!collections.some((collection) => collection.id === collectionId)) {
    throw new Error('That is not one of the shared sections.')
  }

  const articleIds = articleIdsInSection(index, collectionId)
  const db = serviceClient()

  for (let i = 0; i < articleIds.length; i += EXCLUSION_CHUNK) {
    const chunk = articleIds.slice(i, i + EXCLUSION_CHUNK)
    const { error } = hidden
      ? await db.from('help_center_article_exclusions').upsert(
          chunk.map((articleId) => ({ help_center_id: center.id, article_id: articleId })),
          { onConflict: 'help_center_id,article_id', ignoreDuplicates: true },
        )
      : await db
          .from('help_center_article_exclusions')
          .delete()
          .eq('help_center_id', center.id)
          .in('article_id', chunk)
    if (error) throw new Error(`Could not change that section's visibility: ${error.message}`)
  }

  updateTag(EXCLUSIONS_TAG)
  await pushKnowledgeRefresh(center.id)
  revalidatePath('/dashboard/collections')
  revalidatePath('/dashboard/articles')
}
