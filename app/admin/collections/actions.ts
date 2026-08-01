'use server'

import { revalidatePath } from 'next/cache'
import { serviceClient } from '@/lib/db/client'
import { authorize } from '@/lib/authz/authorize'
import { slugify, uniqueSlug } from '@/lib/content/slug'
import { getActiveHelpCenter } from '@/lib/tenancy/active'
import { reindexArticleEverywhere } from '@/lib/search/index-article'

export async function createCollection(formData: FormData): Promise<void> {
  const helpCenter = await getActiveHelpCenter()
  await authorize('collection.create', { helpCenterId: helpCenter.id })

  const title = String(formData.get('title') ?? '').trim()
  if (!title) throw new Error('Title is required.')

  const description = String(formData.get('description') ?? '').trim() || null
  const db = serviceClient()

  // Surface a read failure here rather than computing the slug against an empty
  // list, which would collide with an existing slug and fail opaquely on insert.
  const { data: existing, error: slugReadError } = await db.from('collections').select('slug')
  if (slugReadError) {
    throw new Error(`Could not read existing slugs: ${slugReadError.message}`)
  }

  const slug = uniqueSlug(slugify(title), (existing ?? []).map((r) => r.slug))

  const { data: collection, error } = await db
    .from('collections')
    .insert({ title, slug, description })
    .select('id')
    .single()

  if (error || !collection) throw new Error(`Could not create collection: ${error?.message}`)

  // Place it in the active help center at the end of the list.
  const { count } = await db
    .from('help_center_collections')
    .select('*', { count: 'exact', head: true })
    .eq('help_center_id', helpCenter.id)

  const { error: placementError } = await db.from('help_center_collections').insert({
    help_center_id: helpCenter.id,
    collection_id: collection.id,
    position: count ?? 0,
  })

  if (placementError) throw new Error(`Could not place collection: ${placementError.message}`)

  revalidatePath('/admin/collections')
  revalidatePath('/')
}

export async function deleteCollection(formData: FormData): Promise<void> {
  const helpCenter = await getActiveHelpCenter()
  await authorize('collection.delete', { helpCenterId: helpCenter.id })

  const id = String(formData.get('id') ?? '')
  const db = serviceClient()

  // Collect the articles that lose this collection before the FKs null out
  // their collection ids, so they can be reindexed after the delete.
  const { data: canonical, error: canonicalError } = await db
    .from('articles')
    .select('id')
    .eq('collection_id', id)
  if (canonicalError) {
    throw new Error(`Could not read articles in collection: ${canonicalError.message}`)
  }

  const { data: overridden, error: overriddenError } = await db
    .from('help_center_articles')
    .select('article_id')
    .eq('collection_override_id', id)
  if (overriddenError) {
    throw new Error(`Could not read article placements in collection: ${overriddenError.message}`)
  }

  const affectedArticleIds = new Set([
    ...(canonical ?? []).map((r) => r.id),
    ...(overridden ?? []).map((r) => r.article_id),
  ])

  const { error } = await db.from('collections').delete().eq('id', id)
  if (error) throw new Error(`Could not delete collection: ${error.message}`)

  // Articles left without an effective collection have no public URL, so
  // reindexing drops them from search (see getEffectiveArticleForIndexing).
  for (const articleId of affectedArticleIds) {
    await reindexArticleEverywhere(articleId)
  }

  revalidatePath('/admin/collections')
  revalidatePath('/')
}
