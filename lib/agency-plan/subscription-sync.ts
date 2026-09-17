import type Stripe from 'stripe'
import { serviceClient } from '@/lib/db/client'

/**
 * The Stripe subscription clock, cached onto agency_subscriptions.
 *
 * Stripe owns "are they paying"; these columns cache WHEN that answer next
 * changes — trial end, period end, pending cancellation — so the dashboard
 * banner, the billing page, and the reminder emails can all render without a
 * Stripe read, and so the daily reconcile sweep has something to compare
 * against. Every value here is Stripe's, never invented locally.
 */
export type SubscriptionSnapshot = {
  status: 'trialing' | 'active' | 'past_due' | 'canceled'
  trialEnd: string | null
  currentPeriodEnd: string | null
  cancelAtPeriodEnd: boolean
  amount: number | null
  currency: string | null
  billingInterval: string | null
}

/**
 * Stripe's eight statuses folded into our four.
 *
 * 'incomplete' (first payment still settling) and 'paused' keep their access
 * story out of scope by mapping to the nearest word we do handle: a trial
 * checkout's $0 invoice settles instantly, so 'incomplete' in practice means
 * something went wrong — treated as past_due, which keeps entitlement (grace)
 * while flagging the row for the reconcile sweep.
 */
export function mapStripeStatus(status: Stripe.Subscription.Status): SubscriptionSnapshot['status'] {
  switch (status) {
    case 'trialing':
      return 'trialing'
    case 'active':
      return 'active'
    case 'past_due':
    case 'unpaid':
    case 'incomplete':
    case 'paused':
      return 'past_due'
    case 'canceled':
    case 'incomplete_expired':
      return 'canceled'
    default:
      // A status Stripe adds later: grace, not access loss, until a human
      // teaches this switch the new word.
      return 'past_due'
  }
}

const toIso = (epochSeconds: number | null | undefined): string | null =>
  epochSeconds ? new Date(epochSeconds * 1000).toISOString() : null

/** Extracts the cached columns from a live Stripe subscription. */
export function subscriptionSnapshot(subscription: Stripe.Subscription): SubscriptionSnapshot {
  // Since Stripe's Basil API the period clock lives on the item, not the
  // subscription. One line item is our invariant (single-price plan).
  const item = subscription.items.data[0]
  const price = item?.price

  return {
    status: mapStripeStatus(subscription.status),
    trialEnd: toIso(subscription.trial_end),
    currentPeriodEnd: toIso(item?.current_period_end),
    cancelAtPeriodEnd: subscription.cancel_at_period_end,
    amount: price?.unit_amount ?? null,
    currency: price?.currency ?? null,
    billingInterval: price?.recurring?.interval ?? null,
  }
}

/**
 * Writes a snapshot onto the row for this Stripe subscription, if we have
 * one. Update-only by design: rows are minted exclusively by
 * recordAgencySubscription() at checkout time (email is the join key and
 * only the checkout session carries it), so a subscription event arriving
 * first has nothing to attach to and is safely ignored — the session event
 * that follows performs a full sync of its own.
 */
export async function syncAgencySubscription(
  subscription: Stripe.Subscription,
): Promise<void> {
  const snapshot = subscriptionSnapshot(subscription)
  const { error } = await serviceClient()
    .from('agency_subscriptions')
    .update({
      status: snapshot.status,
      trial_end: snapshot.trialEnd,
      current_period_end: snapshot.currentPeriodEnd,
      cancel_at_period_end: snapshot.cancelAtPeriodEnd,
      amount: snapshot.amount,
      currency: snapshot.currency,
      billing_interval: snapshot.billingInterval,
    })
    .eq('stripe_subscription_id', subscription.id)

  if (error) throw new Error(`Could not sync the agency subscription: ${error.message}`)
}

/** Staff-comped rows carry a fabricated id; they must never reach Stripe. */
export function isCompSubscription(stripeSubscriptionId: string): boolean {
  return stripeSubscriptionId.startsWith('comp-')
}
