/**
 * Registers every existing help centre with Xovera so it appears on
 * their admin Help Center page (registration only — nothing is
 * provisioned, no customer emails). New centres register themselves at
 * claim time (lib/signup/claim.ts); this covers everything created
 * before that hook existed.
 *
 * Owner email resolution, in order: the centre's editor membership →
 * auth.users, else the claimed signup row. Centres with no resolvable
 * email are reported and skipped — Xovera requires a real owner address
 * because a later unlock provisions a passwordless account on it.
 *
 * Run: pnpm tsx scripts/backfill-xovera-registrations.mts [--dry-run] \
 *        [--origin https://app.growthable.io]
 * Env: reads .env.cloud (falls back to .env.local) for Supabase +
 *      XOVERA_API_KEY / XOVERA_BASE_URL.
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
const { isXoveraConfigured, registerInstall, XoveraError } = await import('../lib/ai-widget/client')
const { externalIdFor } = await import('../lib/ai-widget/external-id')
const { helpCenterUrl } = await import('../lib/ai-widget/center-url')

const dryRun = process.argv.includes('--dry-run')
const originIdx = process.argv.indexOf('--origin')
const origin = originIdx > -1 ? process.argv[originIdx + 1] : 'https://app.growthable.io'

if (!isXoveraConfigured()) {
  console.error('XOVERA_API_KEY is not set — nothing to do.')
  process.exit(1)
}

async function ownerEmailFor(helpCenterId: string): Promise<string | null> {
  const db = serviceClient()

  const { data: membership } = await db
    .from('memberships')
    .select('user_id')
    .eq('help_center_id', helpCenterId)
    .eq('role', 'editor')
    .limit(1)
    .maybeSingle()
  if (membership?.user_id) {
    const { data: user } = await db.auth.admin.getUserById(membership.user_id)
    if (user?.user?.email) return user.user.email
  }

  const { data: signup } = await db
    .from('signups')
    .select('email')
    .eq('help_center_id', helpCenterId)
    .not('claimed_at', 'is', null)
    .limit(1)
    .maybeSingle()
  return signup?.email ?? null
}

async function main() {
  const db = serviceClient()

  const { data: centers, error } = await db
    .from('help_centers')
    .select('id, slug, name, is_base')
    .order('created_at', { ascending: true })
  if (error) throw new Error(`Could not list help centres: ${error.message}`)

  const { data: installs } = await db.from('ai_widget_installs').select('help_center_id')
  const known = new Set((installs ?? []).map((r) => r.help_center_id))

  let registered = 0
  let skippedKnown = 0
  let skippedNoEmail = 0
  let failed = 0

  for (const center of centers ?? []) {
    if (center.is_base) continue
    if (known.has(center.id)) {
      // Already has a local install row → the widget flow already
      // registered it with Xovera (provisioning implies registration).
      skippedKnown++
      continue
    }

    const email = await ownerEmailFor(center.id)
    if (!email) {
      console.warn(`skip (no owner email): ${center.slug} (${center.id})`)
      skippedNoEmail++
      continue
    }

    const { data: domainRow } = await db
      .from('custom_domains')
      .select('hostname')
      .eq('help_center_id', center.id)
      .eq('status', 'active')
      .maybeSingle()

    const url = helpCenterUrl(origin, center.slug, domainRow?.hostname ?? null)

    if (dryRun) {
      console.log(`would register: ${center.slug} → ${email} (${url})`)
      registered++
      continue
    }

    try {
      const result = await registerInstall({
        externalId: externalIdFor(center.id),
        email,
        businessName: center.name,
        helpCenterUrl: url,
      })
      console.log(`registered: ${center.slug} → ${result.status}`)
      registered++
    } catch (err) {
      const detail = err instanceof XoveraError ? `${err.code}: ${err.message}` : String(err)
      console.error(`FAILED: ${center.slug} — ${detail}`)
      failed++
      // The write budget is 60/10min across the whole integration; a
      // rate-limit here means stop and re-run later, not hammer on.
      if (err instanceof XoveraError && err.code === 'rate_limited') {
        console.error('Rate-limited — stopping. Re-run in ~10 minutes to continue.')
        break
      }
    }
  }

  console.log(
    `\n${dryRun ? '[dry-run] ' : ''}done: ${registered} registered, ` +
    `${skippedKnown} already known, ${skippedNoEmail} no owner email, ${failed} failed`,
  )
}

await main()
