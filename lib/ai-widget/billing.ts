/**
 * The Growthable-branded upgrade for the AI widget.
 *
 * The customer never sees Xovera billing: checkout runs on OUR Stripe
 * account, in our brand, from our dashboard. On payment the webhook does
 * two things — records the subscription here, and asserts the
 * entitlement to Xovera over the partner API (PUT /installs/{id}/plan),
 * which trusts our org key the same way it trusts us at provisioning.
 *
 * Division of truth, deliberately sharp:
 *   - Stripe owns "are they paying" (subscription state).
 *   - This table caches it (billing_status) for our UI.
 *   - Xovera owns what paying UNLOCKS (handoff, portal, reports).
 * If the Xovera call fails, Stripe is still right — so the webhook
 * retries the assertion rather than refunding, and support can re-assert
 * by re-delivering the webhook from the Stripe dashboard.
 */

import Stripe from 'stripe'
import { serviceClient } from '@/lib/db/client'
import { XoveraError } from './client'

export function isBillingConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_AI_WIDGET_PRICE_ID)
}

let cached: Stripe | null = null
export function stripeClient(): Stripe {
  if (!cached) {
    const key = process.env.STRIPE_SECRET_KEY
    if (!key) throw new Error('STRIPE_SECRET_KEY is not set')
    cached = new Stripe(key)
  }
  return cached
}

/**
 * Which Xovera plan a Growthable subscription buys. One product today;
 * env-swappable because renaming a tier on Xovera's side must not need a
 * GKB deploy.
 */
export function xoveraPlanForSubscription(): string {
  return process.env.XOVERA_PAID_PLAN || 'starter'
}

/**
 * A Checkout Session for upgrading one help centre's widget.
 *
 * client_reference_id carries the help centre id — the webhook's join
 * key back to the install. The email is pinned so the receipt goes to
 * the account owner, and so Stripe reuses one customer per person
 * rather than minting a stranger per checkout.
 */
export async function createUpgradeCheckout(input: {
  helpCenterId: string
  email: string
  origin: string
}): Promise<{ url: string }> {
  const price = process.env.STRIPE_AI_WIDGET_PRICE_ID
  if (!price) throw new Error('STRIPE_AI_WIDGET_PRICE_ID is not set')

  const session = await stripeClient().checkout.sessions.create({
    mode: 'subscription',
    line_items: [{ price, quantity: 1 }],
    customer_email: input.email,
    client_reference_id: input.helpCenterId,
    metadata: { helpCenterId: input.helpCenterId, product: 'ai-widget' },
    subscription_data: { metadata: { helpCenterId: input.helpCenterId, product: 'ai-widget' } },
    success_url: `${input.origin}/dashboard/ai-agent?upgraded=1`,
    cancel_url: `${input.origin}/dashboard/ai-agent`,
    allow_promotion_codes: true,
  })

  if (!session.url) throw new Error('Stripe returned a session with no URL')
  return { url: session.url }
}

/**
 * Payment landed — grant the entitlement everywhere it lives.
 *
 * Ordering: Xovera first, our rows second. If the Xovera call fails we
 * throw, the webhook 500s, and Stripe redelivers — at-least-once is safe
 * because both writes are idempotent. The reverse order could mark us
 * 'paid' and then lose the retry, leaving a customer who paid for
 * features Xovera never unlocked.
 */
export async function fulfillUpgrade(input: {
  helpCenterId: string
  stripeCustomerId: string | null
  stripeSubscriptionId: string | null
}): Promise<void> {
  const install = await requireInstall(input.helpCenterId)

  const { setPartnerPlan } = await import('./client')
  await setPartnerPlan(install.external_id, xoveraPlanForSubscription())

  const db = serviceClient()
  const { error } = await db
    .from('ai_widget_installs')
    .update({
      billing_status: 'paid',
      stripe_customer_id: input.stripeCustomerId,
      stripe_subscription_id: input.stripeSubscriptionId,
    })
    .eq('help_center_id', input.helpCenterId)
  if (error) throw new Error(`Could not record the upgrade: ${error.message}`)

  // The centre's own plan column unlocks GKB-side Pro surfaces.
  const { error: planError } = await db
    .from('help_centers')
    .update({ plan: 'pro' })
    .eq('id', input.helpCenterId)
  if (planError) console.error(`Could not set help centre plan: ${planError.message}`)
}

/**
 * Subscription over (Stripe fires this at period end, after any grace
 * they configured). Mirror image of fulfillUpgrade, same ordering.
 */
export async function fulfillCancellation(helpCenterId: string): Promise<void> {
  const install = await requireInstall(helpCenterId)

  const { setPartnerPlan } = await import('./client')
  try {
    await setPartnerPlan(install.external_id, 'canceled')
  } catch (error) {
    // A 404 means Xovera no longer knows the install — nothing to
    // downgrade. Anything else must trigger Stripe's redelivery.
    if (!(error instanceof XoveraError) || error.code !== 'not_found') throw error
  }

  const db = serviceClient()
  const { error } = await db
    .from('ai_widget_installs')
    .update({ billing_status: 'canceled' })
    .eq('help_center_id', helpCenterId)
  if (error) throw new Error(`Could not record the cancellation: ${error.message}`)

  const { error: planError } = await db
    .from('help_centers')
    .update({ plan: 'free' })
    .eq('id', helpCenterId)
  if (planError) console.error(`Could not reset help centre plan: ${planError.message}`)
}

async function requireInstall(helpCenterId: string): Promise<{ external_id: string }> {
  const { data, error } = await serviceClient()
    .from('ai_widget_installs')
    .select('external_id')
    .eq('help_center_id', helpCenterId)
    .maybeSingle()
  if (error) throw new Error(`Could not load the install: ${error.message}`)
  if (!data) throw new Error(`No AI widget install for help centre ${helpCenterId}`)
  return data
}
