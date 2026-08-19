/**
 * Pulls Xovera-side install state into our ai_widget_installs cache for
 * centres that have none — the recovery path after Growthable staff
 * provision + unlock a centre from Xovera's admin (which never touches
 * our DB). Once the row lands, the public layout renders the widget
 * within its 30s cache window; no customer action needed.
 *
 * Run: pnpm tsx scripts/sync-xovera-installs.mts [--slug <center-slug>]
 * Env: reads .env.cloud (falls back to .env.local).
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

// Import lib code after env is set; serviceClient reads env at call time.
const { serviceClient } = await import('../lib/db/client')
const { isXoveraConfigured } = await import('../lib/ai-widget/client')
const { reconcileInstallForCenter } = await import('../lib/ai-widget/reconcile')

if (!isXoveraConfigured()) {
  console.error('XOVERA_API_KEY is not set — nothing to do.')
  process.exit(1)
}

const slugIdx = process.argv.indexOf('--slug')
const onlySlug = slugIdx > -1 ? process.argv[slugIdx + 1] : null

async function main() {
  const db = serviceClient()

  let query = db.from('help_centers').select('id, slug, is_base')
  if (onlySlug) query = query.eq('slug', onlySlug)
  const { data: centers, error } = await query
  if (error) throw new Error(`Could not list help centres: ${error.message}`)

  const { data: installs } = await db.from('ai_widget_installs').select('help_center_id')
  const known = new Set((installs ?? []).map((r) => r.help_center_id))

  let recovered = 0
  let unchanged = 0
  for (const center of centers ?? []) {
    if (center.is_base) continue
    if (known.has(center.id)) { unchanged++; continue }

    const ok = await reconcileInstallForCenter(center.id)
    if (ok) {
      console.log(`recovered: ${center.slug}`)
      recovered++
    } else {
      unchanged++
    }
  }

  console.log(`\ndone: ${recovered} recovered, ${unchanged} unchanged`)
}

await main()
