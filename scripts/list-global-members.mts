/**
 * Who can reach /admin? Lists every GLOBAL membership (owner/staff) with
 * its email, plus every auth user with no membership at all — the
 * "signed up but can't get anywhere" set. Read-only.
 *
 * Run: pnpm tsx scripts/list-global-members.mts
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

  const { data: globals, error } = await db
    .from('memberships')
    .select('user_id, role')
    .is('help_center_id', null)
  if (error) throw new Error(error.message)

  console.log('Global memberships (admin access):')
  for (const m of globals ?? []) {
    const { data } = await db.auth.admin.getUserById(m.user_id)
    console.log(`  ${m.role}: ${data?.user?.email ?? m.user_id}`)
  }

  const { data: users } = await db.auth.admin.listUsers({ page: 1, perPage: 200 })
  const { data: allMemberships } = await db.from('memberships').select('user_id')
  const withMembership = new Set((allMemberships ?? []).map((m) => m.user_id))
  console.log('\nAuth users with NO membership at all:')
  for (const u of users?.users ?? []) {
    if (!withMembership.has(u.id)) console.log(`  ${u.email}`)
  }
}

await main()
