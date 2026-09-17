import { findEntitlementForCenter } from './entitlement'
import { isCompSubscription } from './subscription-sync'
import { amountLabel, chargeDateLabel, trialDaysLeft } from './trial'

/**
 * What the dashboard-wide banner says about this centre's trial, or null for
 * no banner. Kept out of the layout component so it stays unit-testable and
 * so the layout reads as chrome, not billing logic.
 *
 * A banner exists only while money is in play:
 *   - trialing, converting  → amber countdown with the exact charge
 *   - trialing, cancelled   → quiet confirmation that no charge is coming
 * Comped rows (no Stripe clock) and paid/free states show nothing — the
 * trial state is the one a customer must never be able to miss.
 */
export type TrialBanner = {
  tone: 'countdown' | 'canceled'
  daysLeft: number
  chargeDate: string
  /** "$197/month", or null when the price has not synced yet. */
  priceLabel: string | null
}

export async function trialBannerForCenter(centerId: string): Promise<TrialBanner | null> {
  let entitlement
  try {
    entitlement = await findEntitlementForCenter(centerId)
  } catch (error) {
    // The banner is chrome: a billing read hiccup must never 500 every
    // dashboard page for every customer.
    console.error('trialBannerForCenter failed:', error)
    return null
  }
  if (!entitlement) return null
  if (entitlement.status !== 'trialing') return null
  if (!entitlement.trial_end) return null
  if (isCompSubscription(entitlement.stripe_subscription_id)) return null

  // Clock at zero = the conversion instant has passed and the cached status
  // is just lagging the webhook. Showing "cancel before today — no charge"
  // after the charge would be a lie; show nothing until the sync lands.
  if (trialDaysLeft(entitlement.trial_end, new Date()) === 0) return null

  return {
    tone: entitlement.cancel_at_period_end ? 'canceled' : 'countdown',
    daysLeft: trialDaysLeft(entitlement.trial_end, new Date()),
    chargeDate: chargeDateLabel(entitlement.trial_end),
    priceLabel:
      entitlement.amount != null
        ? `${amountLabel(entitlement.amount, entitlement.currency)}/${entitlement.billing_interval ?? 'month'}`
        : null,
  }
}
