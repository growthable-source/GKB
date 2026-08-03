'use server'

import { revalidatePath } from 'next/cache'
import { serviceClient } from '@/lib/db/client'
import { selectAll } from '@/lib/db/select-all'
import { authorize } from '@/lib/authz/authorize'
import { slugify, uniqueSlug } from '@/lib/content/slug'
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
  const existing = await selectAll(
    // .order('id') gives stable, unique-key .range() pagination — see
    // lib/db/select-all.ts.
    () => db.from('collections').select('slug').order('id'),
    'collection slugs',
  )

  const slug = uniqueSlug(slugify(title), existing.map((r) => r.slug))

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

  revalidatePath('/admin/collections')
  revalidatePath('/')
}
