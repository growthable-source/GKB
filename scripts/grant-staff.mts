/**
 * Grants (or reports) a GLOBAL membership — owner or staff — so an
 * address can reach /admin. Creates the auth user if needed (they sign
 * in by magic link like everyone else).
 *
 * Run: pnpm tsx scripts/grant-staff.mts --email dan@growthable.io [--role staff|owner]
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

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`)
  return i > -1 ? process.argv[i + 1] : undefined
}

const email = arg('email')?.toLowerCase()
const role = arg('role') ?? 'staff'
if (!email || !['staff', 'owner'].includes(role)) {
  console.error('Usage: pnpm tsx scripts/grant-staff.mts --email who@growthable.io [--role staff|owner]')
  process.exit(1)
}

async function main() {
  const db = serviceClient()

  // Find-or-create the auth user.
  let userId: string | null = null
  const { data: created, error: createError } = await db.auth.admin.createUser({ email, email_confirm: true })
  if (created?.user) userId = created.user.id
  else if (createError && /already|exists|registered/i.test(createError.message)) {
    const { data: users } = await db.auth.admin.listUsers({ page: 1, perPage: 200 })
    userId = users?.users.find((u) => u.email?.toLowerCase() === email)?.id ?? null
  } else if (createError) {
    throw new Error(createError.message)
  }
  if (!userId) throw new Error(`Could not resolve a user for ${email}`)

  const { data: existing } = await db
    .from('memberships')
    .select('role')
    .eq('user_id', userId)
    .is('help_center_id', null)
    .maybeSingle()
  if (existing) {
    console.log(`${email} already has global role '${existing.role}' — nothing to do.`)
    return
  }

  const { error } = await db.from('memberships').insert({ user_id: userId, help_center_id: null, role })
  if (error) throw new Error(error.message)
  console.log(`Granted ${role} to ${email}. They sign in at /login with a magic link.`)
}

await main()
