/**
 * Gives every collection a category emoji.
 *
 * Idempotent and non-destructive: only rows where `icon is null` are touched, so
 * re-running never overwrites an emoji edited from the admin. A collection whose
 * slug is not in the map below is left alone and reported, rather than guessed at.
 *
 *   env $(grep -v '^#' .env.cloud | grep '=' | xargs) npx tsx scripts/backfill-collection-emojis.mts [--apply]
 *
 * Without --apply it prints what it would change and writes nothing.
 */
import { createClient } from '@supabase/supabase-js'

const EMOJI_BY_SLUG: Record<string, string> = {
  ai: '🤖',
  blog: '✍️',
  calendar: '📅',
  campaigns: '🎯',
  contact: '👤',
  conversations: '💬',
  crm: '👥',
  'e-commerce': '🛒',
  'email-smtp': '✉️',
  forms: '📝',
  'funnel-builder': '🔀',
  integration: '🔌',
  'migration-guides': '📦',
  miscellaneous: '🧩',
  'mobile-app': '📱',
  opportunities: '💼',
  payments: '💳',
  'phone-system-a2p-registration': '☎️',
  sites: '🌐',
  'social-planner': '📢',
  store: '🏬',
  surveys: '📊',
  task: '✅',
  troubleshooting: '🛠️',
  'websites-and-funnels': '🖥️',
  workflows: '⚙️',
}

const apply = process.argv.includes('--apply')

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.')
}

const db = createClient(url, key, { auth: { persistSession: false } })

const { data: collections, error } = await db
  .from('collections')
  .select('id, slug, title, icon')
  .order('title')

if (error) throw new Error(`Could not read collections: ${error.message}`)

const planned: { slug: string; title: string; emoji: string }[] = []
const alreadySet: string[] = []
const unmapped: string[] = []

for (const collection of collections ?? []) {
  if (collection.icon) {
    alreadySet.push(`${collection.icon} ${collection.title}`)
    continue
  }

  const emoji = EMOJI_BY_SLUG[collection.slug]
  if (!emoji) {
    unmapped.push(`${collection.title} (${collection.slug})`)
    continue
  }

  planned.push({ slug: collection.slug, title: collection.title, emoji })
}

for (const change of planned) console.log(`  ${change.emoji}  ${change.title}`)
if (alreadySet.length) console.log(`\nalready set (left alone): ${alreadySet.length}`)
if (unmapped.length) console.log(`\nno emoji mapped, skipped:\n  ${unmapped.join('\n  ')}`)

if (!apply) {
  console.log(`\n${planned.length} to set. Re-run with --apply to write.`)
  process.exit(0)
}

for (const change of planned) {
  // Re-assert `icon is null` in the write so a concurrent admin edit between the
  // read above and this update is not clobbered.
  const { error: updateError } = await db
    .from('collections')
    .update({ icon: change.emoji })
    .eq('slug', change.slug)
    .is('icon', null)

  if (updateError) throw new Error(`Could not set ${change.slug}: ${updateError.message}`)
}

console.log(`\nSet ${planned.length} emoji.`)
