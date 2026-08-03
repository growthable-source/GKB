/**
 * One-off data repair: removes the now-unused duplicate placement/search rows
 * that pre-correction help-center clones left behind. Help centers share one
 * canonical content pool (see lib/tenancy/active.ts's getBaseHelpCenterId) —
 * a non-base center's own help_center_articles / help_center_collections /
 * article_search rows are dead weight, never read by any code path.
 *
 * Safety gate: before deleting anything, checks every non-base row for real
 * per-center customization (is_hidden=true, any override column set, or a
 * non-public collection audience). If it finds ANY, it halts without
 * deleting and prints exactly what it found — nothing has ever set these
 * columns in this app's history, so the expected result is zero.
 *
 * Run once: pnpm tsx scripts/cleanup-non-base-content.mts
 * Env: reads .env.cloud (falls back to .env.local) for Supabase.
 */
import { readFileSync, existsSync } from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(import.meta.dirname, '..')

function loadEnv(file: string) {
  if (!existsSync(file)) return
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const m = /^([A-Z_]+)=(.*)$/.exec(line.trim())
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2]
  }
}
loadEnv(path.join(ROOT, '.env.cloud'))
loadEnv(path.join(ROOT, '.env.local'))

const { serviceClient } = await import('../lib/db/client')

async function main() {
  const db = serviceClient()

  const { data: base, error: baseError } = await db
    .from('help_centers')
    .select('id, slug')
    .eq('is_base', true)
    .single()
  if (baseError || !base) throw new Error(`No base help center found: ${baseError?.message ?? 'missing row'}`)
  console.log(`base: ${base.slug} (${base.id})`)

  // --- safety gate ---------------------------------------------------------
  const checks: { label: string; count: () => Promise<number> }[] = [
    {
      label: 'articles: is_hidden=true',
      count: async () => {
        const { count } = await db
          .from('help_center_articles')
          .select('*', { count: 'exact', head: true })
          .neq('help_center_id', base.id)
          .eq('is_hidden', true)
        return count ?? 0
      },
    },
    {
      label: 'articles: title_override set',
      count: async () => {
        const { count } = await db
          .from('help_center_articles')
          .select('*', { count: 'exact', head: true })
          .neq('help_center_id', base.id)
          .not('title_override', 'is', null)
        return count ?? 0
      },
    },
    {
      label: 'articles: body_json_override set',
      count: async () => {
        const { count } = await db
          .from('help_center_articles')
          .select('*', { count: 'exact', head: true })
          .neq('help_center_id', base.id)
          .not('body_json_override', 'is', null)
        return count ?? 0
      },
    },
    {
      label: 'articles: body_html_override set',
      count: async () => {
        const { count } = await db
          .from('help_center_articles')
          .select('*', { count: 'exact', head: true })
          .neq('help_center_id', base.id)
          .not('body_html_override', 'is', null)
        return count ?? 0
      },
    },
    {
      label: 'articles: collection_override_id set',
      count: async () => {
        const { count } = await db
          .from('help_center_articles')
          .select('*', { count: 'exact', head: true })
          .neq('help_center_id', base.id)
          .not('collection_override_id', 'is', null)
        return count ?? 0
      },
    },
    {
      label: 'collections: is_hidden=true',
      count: async () => {
        const { count } = await db
          .from('help_center_collections')
          .select('*', { count: 'exact', head: true })
          .neq('help_center_id', base.id)
          .eq('is_hidden', true)
        return count ?? 0
      },
    },
    {
      label: 'collections: title_override set',
      count: async () => {
        const { count } = await db
          .from('help_center_collections')
          .select('*', { count: 'exact', head: true })
          .neq('help_center_id', base.id)
          .not('title_override', 'is', null)
        return count ?? 0
      },
    },
    {
      label: 'collections: description_override set',
      count: async () => {
        const { count } = await db
          .from('help_center_collections')
          .select('*', { count: 'exact', head: true })
          .neq('help_center_id', base.id)
          .not('description_override', 'is', null)
        return count ?? 0
      },
    },
    {
      label: "collections: audience != 'public'",
      count: async () => {
        const { count } = await db
          .from('help_center_collections')
          .select('*', { count: 'exact', head: true })
          .neq('help_center_id', base.id)
          .neq('audience', 'public')
        return count ?? 0
      },
    },
  ]

  console.log('\n=== safety gate: checking for real per-center overrides ===')
  let anyFound = false
  for (const check of checks) {
    const n = await check.count()
    console.log(`  ${check.label}: ${n}`)
    if (n > 0) anyFound = true
  }

  if (anyFound) {
    console.error('\nHALTED: found real per-center customization above. Nothing was deleted.')
    console.error('Investigate before re-running — this script must not destroy real overrides.')
    process.exit(1)
  }
  console.log('safety gate passed: zero real overrides found on any non-base row.\n')

  // --- before counts ---------------------------------------------------------
  async function countsByCenter(table: 'help_center_articles' | 'help_center_collections' | 'article_search') {
    const { data: centers } = await db.from('help_centers').select('id, slug')
    const rows: string[] = []
    for (const c of centers ?? []) {
      const { count } = await db.from(table).select('*', { count: 'exact', head: true }).eq('help_center_id', c.id)
      rows.push(`    ${c.slug}: ${count ?? 0}`)
    }
    return rows.join('\n')
  }

  console.log('=== before ===')
  console.log('help_center_articles:\n' + (await countsByCenter('help_center_articles')))
  console.log('help_center_collections:\n' + (await countsByCenter('help_center_collections')))
  console.log('article_search:\n' + (await countsByCenter('article_search')))

  // --- delete ------------------------------------------------------------
  console.log('\n=== deleting non-base rows ===')
  for (const table of ['help_center_articles', 'help_center_collections', 'article_search'] as const) {
    const { error, count } = await db.from(table).delete({ count: 'exact' }).neq('help_center_id', base.id)
    if (error) throw new Error(`delete from ${table} failed: ${error.message}`)
    console.log(`  ${table}: deleted ${count ?? 'unknown count of'} rows`)
  }

  // --- after ------------------------------------------------------------
  console.log('\n=== after ===')
  console.log('help_center_articles:\n' + (await countsByCenter('help_center_articles')))
  console.log('help_center_collections:\n' + (await countsByCenter('help_center_collections')))
  console.log('article_search:\n' + (await countsByCenter('article_search')))
}

await main()
