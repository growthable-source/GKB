'use server'

import { revalidatePath } from 'next/cache'
import { serviceClient } from '@/lib/db/client'
import { authorize } from '@/lib/authz/authorize'
import { slugify, uniqueSlug } from '@/lib/content/slug'
import { getActiveHelpCenter } from '@/lib/tenancy/active'

export async function createCollection(formData: FormData): Promise<void> {
  const helpCenter = await getActiveHelpCenter()
  await authorize('collection.create', { helpCenterId: helpCenter.id })

  const title = String(formData.get('title') ?? '').trim()
  if (!title) throw new Error('Title is required.')

  const description = String(formData.get('description') ?? '').trim() || null
  const db = serviceClient()

  const { data: existing } = await db.from('collections').select('slug')
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
  const { error } = await serviceClient().from('collections').delete().eq('id', id)
  if (error) throw new Error(`Could not delete collection: ${error.message}`)

  revalidatePath('/admin/collections')
  revalidatePath('/')
}
