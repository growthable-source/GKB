'use server'

import { revalidatePath } from 'next/cache'
import { serviceClient } from '@/lib/db/client'
import { currentActor } from '@/lib/authz/authorize'
import { getOwnedCenter } from '@/lib/dashboard/owned-center'
import { isCentreOwner } from '@/lib/dashboard/centre-owner'
import { findEntitlementForCenter, type AgencyEntitlement } from '@/lib/agency-plan/entitlement'
import { stripeClient } from '@/lib/ai-widget/billing'
import {
  syncAgencySubscription,
  isCompSubscription,
} from '@/lib/agency-plan/subscription-sync'
import { revokeAgencySubscription } from '@/lib/agency-plan/entitlement'
import { needsTrialReminder } from '@/lib/agency-plan/trial'
import {
  sendTrialCanceledEmail,
  sendTrialEndingEmail,
} from '@/lib/agency-plan/trial-emails'

export type BillingActionState = { error?: string } | null

/**
 * Founder-gated, like team and domain management: an invited editor must not
 * be able to cancel the founder's subscription (or keep it alive).
 */
async function ownedEntitlement(): Promise<
  { entitlement: AgencyEntitlement } | { error: string }
> {
  const center = await getOwnedCenter()
  if (!center) return { error: 'No help centre found for this account.' }

  const actor = await currentActor()
  if (!(await isCentreOwner(center.id, actor.userId))) {
    return { error: 'Only the account owner can change billing.' }
  }

  const entitlement = await findEntitlementForCenter(center.id)
  if (!entitlement) return { error: 'No subscription found for this help centre.' }
  if (isCompSubscription(entitlement.stripe_subscription_id)) {
    return { error: 'This plan was set up by our team — contact us and we will sort it out.' }
  }
  return { entitlement }
}

/**
 * Cancel at period end: everything keeps working until the day the trial (or
 * paid period) runs out, and no further charge happens. For a trial that is
 * the whole promise — cancel any time before the date, pay nothing.
 *
 * The webhook's subscription.updated handler also emails and syncs, but the
 * inline calls make the confirmation immediate and keep working even before
 * the webhook endpoint is configured. Both paths are stamped-idempotent, so
 * doubling up sends nothing twice.
 */
export async function cancelAgencyPlan(): Promise<BillingActionState> {
  const resolved = await ownedEntitlement()
  if ('error' in resolved) return { error: resolved.error }
  const { entitlement } = resolved

  try {
    if (entitlement.status === 'past_due') {
      // cancel_at_period_end would NOT stop the dunning already in flight:
      // the open invoice keeps smart-retrying for days, and a late success
      // would charge the card after our written "no charge" promise. A
      // past_due cancel therefore ends the subscription now and voids every
      // open invoice, so no retry can ever collect.
      const stripe = stripeClient()
      await stripe.subscriptions.cancel(entitlement.stripe_subscription_id)
      const open = await stripe.invoices.list({
        subscription: entitlement.stripe_subscription_id,
        status: 'open',
        limit: 100,
      })
      for (const invoice of open.data) {
        if (invoice.id) await stripe.invoices.voidInvoice(invoice.id)
      }
      // Full downgrade now; the deleted webhook that follows is idempotent.
      await revokeAgencySubscription(entitlement.stripe_subscription_id)
      await sendTrialCanceledEmail(entitlement, { endedNow: true })
    } else {
      const subscription = await stripeClient().subscriptions.update(
        entitlement.stripe_subscription_id,
        { cancel_at_period_end: true },
      )
      await syncAgencySubscription(subscription)
      await sendTrialCanceledEmail(entitlement)
    }
  } catch (error) {
    console.error('Could not cancel the agency subscription:', error)
    return { error: 'Could not cancel just now — please try again, or contact us.' }
  }

  revalidatePath('/dashboard/billing')
  return null
}

/** Undo a scheduled cancellation before the period runs out. */
export async function resumeAgencyPlan(): Promise<BillingActionState> {
  const resolved = await ownedEntitlement()
  if ('error' in resolved) return { error: resolved.error }
  const { entitlement } = resolved

  try {
    const subscription = await stripeClient().subscriptions.update(
      entitlement.stripe_subscription_id,
      { cancel_at_period_end: false },
    )
    await syncAgencySubscription(subscription)
    // Re-arm the cancellation confirmation: a later cancel is a new event
    // and deserves its own written proof.
    await serviceClient()
      .from('agency_subscriptions')
      .update({ canceled_email_sent_at: null })
      .eq('id', entitlement.id)
    // Resuming inside the reminder window: the started email promised a
    // days-left warning before any charge, and trial_will_end already fired
    // (into the cancelled state, where it rightly stayed silent). Send it
    // now or the conversion lands unwarned.
    if (
      subscription.status === 'trialing' &&
      needsTrialReminder(
        { ...entitlement, status: 'trialing', cancel_at_period_end: false, reminder_email_sent_at: null },
        new Date(),
      )
    ) {
      await sendTrialEndingEmail(entitlement)
    }
  } catch (error) {
    console.error('Could not resume the agency subscription:', error)
    return { error: 'Could not resume just now — please try again, or contact us.' }
  }

  revalidatePath('/dashboard/billing')
  return null
}
