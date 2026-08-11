import { serviceClient } from '@/lib/db/client'
import { xoveraPlanForSubscription } from '@/lib/ai-widget/billing'
import { XoveraError } from '@/lib/ai-widget/client'

/**
 * The $197/mo Agency AI plan, sold on growthable.io.
 *
 * The marketing site runs that Stripe checkout with metadata.product =
 * 'agency-plan'; the only key both sides share is the customer's email. This
 * module owns the association and applies it wherever a help centre exists:
 *
 *   - webhook time (lib called from /api/stripe/webhook): the subscription is
 *     recorded, and if this email already claimed a centre, entitled now.
 *   - claim time (called from lib/signup/claim.ts): pay first, sign up after —
 *     the freshly created centre picks up the waiting entitlement.
 *   - widget-add time (called from lib/ai-widget/install.ts): an entitled
 *     centre's widget goes straight to the paid Xovera plan, skipping the
 *     widget's own trial and its upgrade checkout.
 *
 * Same division of truth as the widget billing: Stripe owns "are they
 * paying", these rows cache it, Xovera owns what paying unlocks.
 */

export type AgencyEntitlement = {
  id: string
  email: string
  stripe_customer_id: string | null
  stripe_subscription_id: string
  status: string
  help_center_id: string | null
}

const FIELDS = 'id, email, stripe_customer_id, stripe_subscription_id, status, help_center_id'

const ENTITLED = ['trialing', 'active']

/** The live entitlement for an email, if any. */
export async function findEntitlementByEmail(email: string): Promise<AgencyEntitlement | null> {
  const { data, error } = await serviceClient()
    .from('agency_subscriptions')
    .select(FIELDS)
    .ilike('email', email.toLowerCase())
    .in('status', ENTITLED)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) throw new Error(`Could not read the agency subscription: ${error.message}`)
  return (data as AgencyEntitlement) ?? null
}

/** The live entitlement already attached to a help centre, if any. */
export async function findEntitlementForCenter(
  helpCenterId: string,
): Promise<AgencyEntitlement | null> {
  const { data, error } = await serviceClient()
    .from('agency_subscriptions')
    .select(FIELDS)
    .eq('help_center_id', helpCenterId)
    .in('status', ENTITLED)
    .limit(1)
    .maybeSingle()

  if (error) throw new Error(`Could not read the agency subscription: ${error.message}`)
  return (data as AgencyEntitlement) ?? null
}

/**
 * Records a paid checkout, then applies it if this email's centre already
 * exists. Idempotent on subscription id — Stripe redelivers webhooks, and a
 * second delivery must update the same row, not mint a rival.
 */
export async function recordAgencySubscription(input: {
  email: string
  stripeCustomerId: string | null
  stripeSubscriptionId: string
}): Promise<void> {
  const email = input.email.toLowerCase()
  const db = serviceClient()

  const { data, error } = await db
    .from('agency_subscriptions')
    .upsert(
      {
        email,
        stripe_customer_id: input.stripeCustomerId,
        stripe_subscription_id: input.stripeSubscriptionId,
        status: 'trialing',
      },
      { onConflict: 'stripe_subscription_id' },
    )
    .select(FIELDS)
    .single()
  if (error || !data) {
    throw new Error(`Could not record the agency subscription: ${error?.message}`)
  }

  // Bought after signing up: their centre exists, entitle it now.
  const centerId = await centerIdForEmail(email)
  if (centerId) await applyEntitlementToCenter(data as AgencyEntitlement, centerId)
}

/**
 * Subscription over. Downgrades whatever the entitlement had unlocked; a
 * subscription that never attached to a centre just flips its row.
 */
export async function revokeAgencySubscription(stripeSubscriptionId: string): Promise<void> {
  const db = serviceClient()
  const { data, error } = await db
    .from('agency_subscriptions')
    .update({ status: 'canceled' })
    .eq('stripe_subscription_id', stripeSubscriptionId)
    .select(FIELDS)
    .maybeSingle()
  if (error) throw new Error(`Could not record the cancellation: ${error.message}`)
  if (!data?.help_center_id) return

  const helpCenterId = data.help_center_id

  // Mirror of apply, same Xovera-first ordering as the widget billing.
  const install = await installForCenter(helpCenterId)
  if (install) {
    const { setPartnerPlan } = await import('@/lib/ai-widget/client')
    try {
      await setPartnerPlan(install.external_id, 'canceled')
    } catch (err) {
      if (!(err instanceof XoveraError) || err.code !== 'not_found') throw err
    }
    const { error: billingError } = await db
      .from('ai_widget_installs')
      .update({ billing_status: 'canceled' })
      .eq('help_center_id', helpCenterId)
    if (billingError) {
      throw new Error(`Could not record the widget downgrade: ${billingError.message}`)
    }
  }

  const { error: planError } = await db
    .from('help_centers')
    .update({ plan: 'free' })
    .eq('id', helpCenterId)
  if (planError) console.error(`Could not reset help centre plan: ${planError.message}`)
}

/**
 * Grants the plan to a centre: Pro surfaces on, subscription row stamped, and
 * — when a widget install exists — the paid Xovera plan asserted so the
 * widget never shows this customer a trial countdown or an upgrade button.
 *
 * Xovera before our rows, for the same reason as fulfillUpgrade: marking
 * ourselves paid and then losing the Xovera call would leave a customer who
 * paid for features that never unlocked.
 */
export async function applyEntitlementToCenter(
  entitlement: AgencyEntitlement,
  helpCenterId: string,
): Promise<void> {
  const db = serviceClient()

  const install = await installForCenter(helpCenterId)
  if (install && install.billing_status !== 'paid') {
    const { setPartnerPlan } = await import('@/lib/ai-widget/client')
    await setPartnerPlan(install.external_id, xoveraPlanForSubscription())

    const { error } = await db
      .from('ai_widget_installs')
      .update({
        billing_status: 'paid',
        stripe_customer_id: entitlement.stripe_customer_id,
        stripe_subscription_id: entitlement.stripe_subscription_id,
      })
      .eq('help_center_id', helpCenterId)
    if (error) throw new Error(`Could not record the widget entitlement: ${error.message}`)
  }

  const { error: planError } = await db
    .from('help_centers')
    .update({ plan: 'pro' })
    .eq('id', helpCenterId)
  if (planError) console.error(`Could not set help centre plan: ${planError.message}`)

  const { error: linkError } = await db
    .from('agency_subscriptions')
    .update({ help_center_id: helpCenterId })
    .eq('id', entitlement.id)
  if (linkError) console.error(`Could not link the subscription: ${linkError.message}`)
}

/**
 * Best-effort application for call sites that must never fail on our CRM or
 * billing plumbing (claiming a signup, adding the widget). Logs and moves on.
 */
export async function applyEntitlementIfAny(
  helpCenterId: string,
  email: string,
): Promise<void> {
  try {
    const entitlement = await findEntitlementByEmail(email)
    if (entitlement) await applyEntitlementToCenter(entitlement, helpCenterId)
  } catch (error) {
    console.error(`Could not apply the agency plan for ${email}:`, error)
  }
}

/** The claimed centre this email owns, via its signup row. */
async function centerIdForEmail(email: string): Promise<string | null> {
  const { data, error } = await serviceClient()
    .from('signups')
    .select('help_center_id')
    .ilike('email', email)
    .not('help_center_id', 'is', null)
    .order('claimed_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) throw new Error(`Could not look up the help centre: ${error.message}`)
  return data?.help_center_id ?? null
}

async function installForCenter(
  helpCenterId: string,
): Promise<{ external_id: string; billing_status: string } | null> {
  const { data, error } = await serviceClient()
    .from('ai_widget_installs')
    .select('external_id, billing_status')
    .eq('help_center_id', helpCenterId)
    .maybeSingle()
  if (error) throw new Error(`Could not load the install: ${error.message}`)
  return data ?? null
}
