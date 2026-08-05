import { redirect } from 'next/navigation'
import { readSignupToken } from '@/lib/signup/session'
import { findSignupByToken } from '@/lib/signup/repository'
import { getBaseHelpCenterId } from '@/lib/tenancy/active'
import { getCachedArticleCollectionIndex, getCachedCollections } from '@/lib/content/cached'
import { countArticlesPerCollection } from '@/lib/content/queries'
import { slugify } from '@/lib/content/slug'
import { submitBuild } from '../actions'
import { BuilderForm } from '@/components/marketing/builder-form'

export const metadata = { title: 'Build your help centre — Growthable' }

export default async function BuildPage() {
  const token = await readSignupToken()
  const signup = token ? await findSignupByToken(token) : null
  if (!signup) redirect('/get/details')
  if (signup.claimed_at) redirect('/dashboard')

  const baseId = await getBaseHelpCenterId()
  const [collections, index] = await Promise.all([
    getCachedCollections(baseId),
    getCachedArticleCollectionIndex(baseId),
  ])

  // Real categories in the preview, not placeholders: the whole claim of this
  // screen is that the content already exists, and lorem would undercut it.
  const counts = countArticlesPerCollection(index, new Set<string>())
  const preview = collections
    .map((collection) => ({
      title: collection.title,
      icon: collection.icon,
      count: counts[collection.id] ?? 0,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 6)

  const branding = (signup.branding ?? {}) as Record<string, unknown>
  const suggestedName = signup.center_name ?? signup.agency_name ?? ''

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-7 px-5 py-12 sm:px-8 sm:py-16">
      <div className="flex flex-col gap-2">
        <p className="mk-eyebrow mk-mono text-xs uppercase tracking-[0.14em] text-[color:var(--mk-accent)]">
          Step 7 of 7
        </p>
        <h1 className="text-3xl tracking-tight sm:text-4xl">Make it yours.</h1>
        <p className="max-w-xl text-[color:var(--mk-ink-soft)]">
          The preview is the real thing — those categories and counts are what your help centre
          will hold the moment it goes live.
        </p>
      </div>

      <BuilderForm
        action={submitBuild}
        collections={preview}
        defaults={{
          centerName: suggestedName,
          slug: signup.center_slug ?? (suggestedName ? slugify(suggestedName) : ''),
          primaryHex: String(branding.primaryHex ?? '#1f6feb'),
          secondaryHex: String(branding.secondaryHex ?? '#6e7781'),
          logoUrl: (branding.logoUrl as string | null) ?? '',
          heroStyle: String(branding.heroStyle ?? 'gradient'),
          headline: String(branding.headline ?? ''),
          bodyFont: String(branding.bodyFont ?? ''),
          headingFont: String(branding.headingFont ?? ''),
          tilesPerRow: Number(branding.tilesPerRow ?? 3),
        }}
      />
    </main>
  )
}
