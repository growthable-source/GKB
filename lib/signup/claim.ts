import { revalidateTag } from 'next/cache'
import { serviceClient } from '@/lib/db/client'
import { BRAND_TAG } from '@/lib/cache/tags'
import { createBrandedHelpCenter } from '@/lib/tenancy/create-center'
import { toAppearanceColumns, type AppearanceInput } from '@/lib/tenancy/appearance'
import { DEFAULT_PRIMARY_HEX, DEFAULT_SECONDARY_HEX } from '@/lib/tenancy/color'
import { checkSlugAvailable, nextAvailableCenterSlug } from './slug-availability'
import { findPendingSignupByEmail, updateSignup, type Signup } from './repository'
import { deliverSignup } from './deliver'

export type ClaimOutcome =
  | { kind: 'claimed'; slug: string; notice?: string }
  | { kind: 'already-claimed'; slug: string }
  | { kind: 'already-owns-center'; slug: string }
  | { kind: 'no-signup' }

type Branding = Partial<AppearanceInput> & {
  primaryHex?: string
  secondaryHex?: string
  logoUrl?: string | null
  faviconUrl?: string | null
  headline?: string
  subtitle?: string
}

/** The center this user already owns, if any. One center per user, for now. */
async function existingCenterFor(userId: string): Promise<{ slug: string } | null> {
  const { data, error } = await serviceClient()
    .from('memberships')
    .select('help_centers (slug)')
    .eq('user_id', userId)
    .not('help_center_id', 'is', null)
    .limit(1)
    .maybeSingle()

  if (error) throw new Error(`Could not check your account: ${error.message}`)
  const center = data?.help_centers as unknown as { slug: string } | null | undefined
  return center ?? null
}

/**
 * Turns a verified email into a live help center.
 *
 * Everything here is written to survive a second click on the same magic link,
 * and to never dead-end someone on the last screen of a funnel they already
 * finished. A slug taken in the meantime becomes `acme-2` with a notice; a
 * branding blob that fails validation falls back to schema defaults with a
 * notice. Both are fixable in the dashboard in ten seconds. Neither is worth
 * losing a signup over.
 */
export async function claimSignup(
  userId: string,
  email: string,
  origin?: string,
): Promise<ClaimOutcome> {
  const owned = await existingCenterFor(userId)
  if (owned) return { kind: 'already-owns-center', slug: owned.slug }

  const signup = await findPendingSignupByEmail(email)
  if (!signup) {
    const claimed = await claimedSignupFor(email)
    return claimed ? { kind: 'already-claimed', slug: claimed } : { kind: 'no-signup' }
  }

  const notices: string[] = []
  const branding = (signup.branding ?? {}) as Branding
  const wantedSlug = signup.center_slug ?? signup.agency_name ?? signup.full_name
  const name = signup.center_name ?? signup.agency_name ?? 'Help Centre'

  // Someone may have taken the address between the builder and this click.
  const check = await checkSlugAvailable(wantedSlug, signup.id)
  let slug = check.slug
  if (!check.available) {
    slug = await nextAvailableCenterSlug(wantedSlug)
    notices.push(`"${check.slug}" was taken, so your help centre is at "${slug}" for now.`)
  }

  let appearance: Partial<AppearanceInput> = branding
  try {
    toAppearanceColumns(branding)
  } catch {
    // A bad colour is not worth failing a signup for. Schema defaults, and a
    // nudge toward the branding screen.
    appearance = {}
    notices.push('We could not apply some of your branding, so we used the defaults.')
  }

  const created = await createBrandedHelpCenter({
    name,
    slug,
    primaryHex: branding.primaryHex || DEFAULT_PRIMARY_HEX,
    secondaryHex: branding.secondaryHex || DEFAULT_SECONDARY_HEX,
    logoUrl: branding.logoUrl ?? undefined,
    faviconUrl: branding.faviconUrl ?? undefined,
    headline: branding.headline,
    subtitle: branding.subtitle,
    ...appearance,
  })

  const { error: membershipError } = await serviceClient()
    .from('memberships')
    // editor is the only center-scoped role that may update its own center;
    // memberships_scope_matches_role rejects owner and staff here.
    .insert({ user_id: userId, help_center_id: created.id, role: 'editor' })
  if (membershipError) {
    throw new Error(`Could not link your account to the help centre: ${membershipError.message}`)
  }

  const finished = await updateSignup(signup.id, {
    help_center_id: created.id,
    center_slug: created.slug,
    center_name: name,
    claimed_at: new Date().toISOString(),
    step: 'done',
  })

  // Brand lookups are cached across requests with a TTL (lib/tenancy/active.ts).
  // Without this the owner's brand-new centre 404s at them for minutes.
  //
  // revalidateTag, not updateTag: this runs in a route handler, and updateTag
  // is only callable from a Server Action. `expire: 0` purges immediately
  // rather than letting the brand TTL serve a stale miss at the owner.
  revalidateTag(BRAND_TAG, { expire: 0 })

  // Second delivery: upserts the same lead, now carrying the live centre. Not
  // fired and forgotten — a serverless function can be torn down as soon as it
  // responds, and a dangling promise dies with it. deliverSignup never throws.
  await deliverSignup(finished as Signup, origin)

  return {
    kind: 'claimed',
    slug: created.slug,
    notice: notices.length ? notices.join(' ') : undefined,
  }
}

async function claimedSignupFor(email: string): Promise<string | null> {
  const { data, error } = await serviceClient()
    .from('signups')
    .select('center_slug')
    .eq('email', email.toLowerCase())
    .not('claimed_at', 'is', null)
    .order('claimed_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) throw new Error(`Could not read the signup: ${error.message}`)
  return data?.center_slug ?? null
}
