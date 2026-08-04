'use server'

import { revalidatePath, updateTag } from 'next/cache'
import { CONTENT_ARTICLES_TAG, CONTENT_COLLECTIONS_TAG } from '@/lib/cache/tags'
import { serviceClient } from '@/lib/db/client'
import { selectAll } from '@/lib/db/select-all'
import { authorize } from '@/lib/authz/authorize'
import { slugify } from '@/lib/content/slug'
import { nextAvailableSlug } from '@/lib/content/unique-slug'
import { getBaseHelpCenterId } from '@/lib/tenancy/active'
import { reindexArticleEverywhere } from '@/lib/search/index-article'

export async function createCollection(formData: FormData): Promise<void> {
  const baseId = await getBaseHelpCenterId()
  await authorize('collection.create', { helpCenterId: baseId })

  const title = String(formData.get('title') ?? '').trim()
  if (!title) throw new Error('Title is required.')

  const description = String(formData.get('description') ?? '').trim() || null
  const db = serviceClient()

  // Surface a read failure here rather than computing the slug against an empty
  // list, which would collide with an existing slug and fail opaquely on insert.
  const slug = await nextAvailableSlug('collections', slugify(title))

  const { data: collection, error } = await db
    .from('collections')
    .insert({ title, slug, description })
    .select('id')
    .single()

  if (error || !collection) throw new Error(`Could not create collection: ${error?.message}`)

  // Place it in the base center's shared structure, which every brand reads
  // through — see lib/tenancy/active.ts's getBaseHelpCenterId.
  const { count } = await db
    .from('help_center_collections')
    .select('*', { count: 'exact', head: true })
    .eq('help_center_id', baseId)

  const { error: placementError } = await db.from('help_center_collections').insert({
    help_center_id: baseId,
    collection_id: collection.id,
    position: count ?? 0,
  })

  if (placementError) throw new Error(`Could not place collection: ${placementError.message}`)

  updateTag(CONTENT_COLLECTIONS_TAG)
  revalidatePath('/admin/collections')
  revalidatePath('/')
}

/**
 * Accepts one emoji, or empty to clear it. Grapheme-segmented rather than
 * length-checked, because a single emoji is routinely several code units
 * ("👩‍💻" is 5) — `.length <= 2` would reject valid input and allow "ab".
 */
function parseEmoji(raw: string): string | null {
  const value = raw.trim()
  if (!value) return null

  const graphemes = [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(value)]
  if (graphemes.length !== 1) throw new Error('Use a single emoji, or leave it empty.')
  if (!/\p{Extended_Pictographic}/u.test(value)) throw new Error('That is not an emoji.')

  return value
}

export async function updateCollection(formData: FormData): Promise<void> {
  await authorize('collection.update', { helpCenterId: await getBaseHelpCenterId() })

  const id = String(formData.get('id') ?? '')
  const icon = parseEmoji(String(formData.get('icon') ?? ''))

  const { error } = await serviceClient().from('collections').update({ icon }).eq('id', id)
  if (error) throw new Error(`Could not update collection: ${error.message}`)

  // Public collection lists are cached under this tag (lib/content/cached.ts).
  updateTag(CONTENT_COLLECTIONS_TAG)
  revalidatePath('/admin/collections')
  revalidatePath('/')
}

export async function deleteCollection(formData: FormData): Promise<void> {
  await authorize('collection.delete', { helpCenterId: await getBaseHelpCenterId() })

  const id = String(formData.get('id') ?? '')
  const db = serviceClient()

  // Collect the articles that lose this collection before the FKs null out
  // their collection ids, so they can be reindexed after the delete.
  const canonical = await selectAll(
    // id is the PK — unique and safe to page on.
    () => db.from('articles').select('id').eq('collection_id', id).order('id'),
    'articles in collection',
  )

  const overridden = await selectAll(
    // Not scoped by help_center_id, so article_id alone can repeat (the same
    // article placed in multiple centers) — order by the full composite PK
    // for a stable, unique .range() pagination order.
    () =>
      db
        .from('help_center_articles')
        .select('article_id')
        .eq('collection_override_id', id)
        .order('help_center_id')
        .order('article_id'),
    'article placements in collection',
  )

  const affectedArticleIds = new Set([
    ...canonical.map((r) => r.id),
    ...overridden.map((r) => r.article_id),
  ])

  const { error } = await db.from('collections').delete().eq('id', id)
  if (error) throw new Error(`Could not delete collection: ${error.message}`)

  // Articles left without an effective collection have no public URL, so
  // reindexing drops them from search (see getEffectiveArticleForIndexing).
  for (const articleId of affectedArticleIds) {
    await reindexArticleEverywhere(articleId)
  }

  // Both tags: the collection is gone from the list, and the articles that
  // pointed at it have lost their effective collection.
  updateTag(CONTENT_COLLECTIONS_TAG)
  updateTag(CONTENT_ARTICLES_TAG)
  revalidatePath('/admin/collections')
  revalidatePath('/')
}
