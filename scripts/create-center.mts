/**
 * Thin CLI over createBrandedHelpCenter: creates a new BRANDED help center.
 * It has no content of its own — every center reads the same shared
 * collections/articles through the base center (see
 * lib/tenancy/active.ts's getBaseHelpCenterId).
 *
 * Run: pnpm tsx scripts/create-center.mts --name "Acme Support" --slug acme \
 *        --primary "#7C3AED" --secondary "#64748B" \
 *        [--logo <url>] [--headline <text>] [--subtitle <text>]
 * Env: reads .env.cloud (falls back to .env.local) for Supabase URL + service key.
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
const { createBrandedHelpCenter } = await import('../lib/tenancy/create-center')

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`)
  return i > -1 ? process.argv[i + 1] : undefined
}

const name = arg('name')
const slug = arg('slug')
const primary = arg('primary')
const secondary = arg('secondary')
const logo = arg('logo')
const headline = arg('headline')
const subtitle = arg('subtitle')

if (!name || !slug || !primary || !secondary) {
  console.error(
    'Usage: pnpm tsx scripts/create-center.mts --name "Acme Support" --slug acme --primary "#7C3AED" --secondary "#64748B" [--logo <url>] [--headline <text>] [--subtitle <text>]',
  )
  process.exit(1)
}

async function main() {
  const created = await createBrandedHelpCenter({
    name: name!,
    slug: slug!,
    primaryHex: primary!,
    secondaryHex: secondary!,
    logoUrl: logo,
    headline,
    subtitle,
  })

  console.log(`Created help center "${created.slug}" (id: ${created.id}).`)
  console.log(
    `Point DNS for ${created.slug}.<your-tenant-domain> at this deployment (or add a custom_domains row) before it resolves publicly.`,
  )
}

await main()
