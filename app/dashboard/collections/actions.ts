'use server'

import { revalidatePath, updateTag } from 'next/cache'
import { CONTENT_ARTICLES_TAG, CONTENT_COLLECTIONS_TAG } from '@/lib/cache/tags'
import { serviceClient } from '@/lib/db/client'
import { authorize } from '@/lib/authz/authorize'
import { slugify } from '@/lib/content/slug'
import { nextAvailableSlug } from '@/lib/content/unique-slug'
import { getOwnedCenter } from '@/lib/dashboard/owned-center'
import { assertOwnsCollection } from '@/lib/dashboard/owned-content'

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
}
