import { serviceClient } from '@/lib/db/client'
import { slugify } from '@/lib/content/slug'
import { assertHex } from '@/lib/tenancy/color'

const RESERVED_SLUGS = new Set([
  'www', 'api', 'admin', 'a', 'search', 'login', 'auth', 'assets', 'ops',
])
const SEARCH_CHUNK_SIZE = 200

export type CloneHelpCenterInput = {
  name: string
  slug: string
  primaryHex: string
  secondaryHex: string
  logoUrl?: string | null
  faviconUrl?: string | null
  headline?: string
  subtitle?: string
}

export type ClonedHelpCenter = { id: string; slug: string }

type Db = ReturnType<typeof serviceClient>

/**
 * Creates a new help center by copying the base center's collection and
 * article placements (positions, hidden state, overrides) plus its search
 * index. Articles and collections themselves are canonical and shared — only
 * placement rows are copied.
 */
export async function cloneHelpCenter(input: CloneHelpCenterInput): Promise<ClonedHelpCenter> {
  const slug = slugify(input.slug)
  if (RESERVED_SLUGS.has(slug)) {
    throw new Error(`"${slug}" is a reserved slug and cannot be used for a help center.`)
  }

  assertHex(input.primaryHex, 'Primary color')
  assertHex(input.secondaryHex, 'Secondary color')

  const db = serviceClient()

  const { data: existing, error: existingError } = await db
    .from('help_centers')
    .select('id')
    .eq('slug', slug)
    .maybeSingle()
  if (existingError) {
    throw new Error(`Could not check slug availability: ${existingError.message}`)
  }
  if (existing) throw new Error(`The slug "${slug}" is already in use.`)

  const { data: base, error: baseError } = await db
    .from('help_centers')
    .select('id')
    .eq('is_base', true)
    .single()
  if (baseError || !base) {
    throw new Error(`No base help center found: ${baseError?.message ?? 'missing row'}`)
  }

  const settings: { headline?: string; subtitle?: string } = {}
  if (input.headline) settings.headline = input.headline
  if (input.subtitle) settings.subtitle = input.subtitle

  const { data: created, error: createError } = await db
    .from('help_centers')
    .insert({
      name: input.name,
      slug,
      is_base: false,
      cloned_from_id: base.id,
      primary_hex: input.primaryHex,
      secondary_hex: input.secondaryHex,
      logo_url: input.logoUrl || null,
      favicon_url: input.faviconUrl || null,
      visibility: 'public',
      auto_include_new_articles: true,
      settings,
    })
    .select('id, slug')
    .single()
  if (createError || !created) {
    throw new Error(`Could not create help center: ${createError?.message}`)
  }

  try {
    await copyCollectionPlacements(db, base.id, created.id)
    await copyArticlePlacements(db, base.id, created.id)
    await copySearchRows(db, base.id, created.id)
  } catch (error) {
    // Best-effort cleanup: delete the just-created center — cascades clean up
    // any placement/search rows already copied — then surface the real error.
    await db.from('help_centers').delete().eq('id', created.id)
    throw error
  }

  return { id: created.id, slug: created.slug }
}

async function copyCollectionPlacements(db: Db, baseId: string, newId: string): Promise<void> {
  const { data, error } = await db
    .from('help_center_collections')
    .select('collection_id, position, is_hidden, title_override, description_override, audience')
    .eq('help_center_id', baseId)
  if (error) throw new Error(`Could not read base collection placements: ${error.message}`)
  if (!data || data.length === 0) return

  const rows = data.map((row) => ({ ...row, help_center_id: newId }))
  const { error: insertError } = await db.from('help_center_collections').insert(rows)
  if (insertError) throw new Error(`Could not copy collection placements: ${insertError.message}`)
}

async function copyArticlePlacements(db: Db, baseId: string, newId: string): Promise<void> {
  const { data, error } = await db
    .from('help_center_articles')
    .select(
      'article_id, position, is_hidden, title_override, body_json_override, body_html_override, collection_override_id',
    )
    .eq('help_center_id', baseId)
  if (error) throw new Error(`Could not read base article placements: ${error.message}`)
  if (!data || data.length === 0) return

  const rows = data.map((row) => ({ ...row, help_center_id: newId }))
  const { error: insertError } = await db.from('help_center_articles').insert(rows)
  if (insertError) throw new Error(`Could not copy article placements: ${insertError.message}`)
}

async function copySearchRows(db: Db, baseId: string, newId: string): Promise<void> {
  const { data, error } = await db
    .from('article_search')
    .select('article_id, title, body_text, embedding, indexed_at')
    .eq('help_center_id', baseId)
  if (error) throw new Error(`Could not read base search rows: ${error.message}`)
  if (!data || data.length === 0) return

  for (let i = 0; i < data.length; i += SEARCH_CHUNK_SIZE) {
    const chunk = data.slice(i, i + SEARCH_CHUNK_SIZE).map((row) => ({ ...row, help_center_id: newId }))
    const { error: insertError } = await db.from('article_search').insert(chunk)
    if (insertError) throw new Error(`Could not copy search rows: ${insertError.message}`)
  }
}
