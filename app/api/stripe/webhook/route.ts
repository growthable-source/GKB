import { NextResponse } from 'next/server'
import type Stripe from 'stripe'
import { updateTag } from 'next/cache'
import { AI_WIDGET_TAG } from '@/lib/cache/tags'
import { serviceClient } from '@/lib/db/client'
import { stripeClient, fulfillUpgrade, fulfillCancellation } from '@/lib/ai-widget/billing'
import {
  recordAgencySubscription,
  revokeAgencySubscription,
} from '@/lib/agency-plan/entitlement'
import {
  syncAgencySubscription,
  isCompSubscription,
} from '@/lib/agency-plan/subscription-sync'
import {
  sendTrialStartedEmail,
  sendTrialEndingEmail,
  sendTrialCanceledEmail,
} from '@/lib/agency-plan/trial-emails'
import { needsTrialReminder } from '@/lib/agency-plan/trial'

/**
 * Stripe events for the AI widget subscription and the Agency AI plan.
 *
 * Signature-verified against the RAW body — reading it as text before any
 * JSON parse is what makes that possible. Unhandled event types 200
 * immediately so Stripe does not retry noise at us forever.
 *
 * Failure semantics: a handler that throws returns 500, and Stripe
 * redelivers with backoff for days. Both handlers are idempotent, so
 * at-least-once delivery is the safety net for the Xovera call inside —
 * see lib/ai-widget/billing.ts for the ordering argument.
 */
export async function POST(request: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET
  if (!secret) {
    console.error('STRIPE_WEBHOOK_SECRET is not set; rejecting webhook')
    return NextResponse.json({ error: 'not configured' }, { status: 503 })
  }

  const signature = request.headers.get('stripe-signature')
  if (!signature) return NextResponse.json({ error: 'missing signature' }, { status: 400 })

  let event: Stripe.Event
  try {
    const raw = await request.text()
    event = await stripeClient().webhooks.constructEventAsync(raw, signature, secret)
  } catch (error) {
    console.error('Stripe webhook signature verification failed:', error)
    return NextResponse.json({ error: 'invalid signature' }, { status: 400 })
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object

        // The $197 Agency AI plan, sold on growthable.io. Email is the only
        // join key the marketing checkout has; a session without one (possible
        // in theory, never in practice) is logged and skipped, not errored.
        if (session.metadata?.product === 'agency-plan') {
          const email = session.customer_details?.email
          if (!email) {
            console.error(`agency-plan session ${session.id} arrived without an email`)
            break
          }
          // A session without a subscription id is a misconfigured checkout
          // (payment mode, or an unexpanded shape). Minting a row keyed on
          // the session id would create a subscription Stripe can never
          // cancel and this app can never reconcile — skip loudly instead.
          if (typeof session.subscription !== 'string') {
            console.error(`agency-plan session ${session.id} has no subscription id; skipped`)
            break
          }
          const stripeSubscriptionId = session.subscription
          await recordAgencySubscription({
            email,
            stripeCustomerId: typeof session.customer === 'string' ? session.customer : null,
            stripeSubscriptionId,
          })

          // The session only says "a subscription exists"; the subscription
          // itself carries the trial clock. Pull it, cache it, and put the
          // terms in the customer's inbox before they have closed the tab.
          if (!isCompSubscription(stripeSubscriptionId)) {
            const subscription = await stripeClient().subscriptions.retrieve(stripeSubscriptionId)
            await syncAgencySubscription(subscription)
            const row = await agencyRowForSubscription(stripeSubscriptionId)
            if (row) await sendTrialStartedEmail(row)
          }
          updateTag(AI_WIDGET_TAG)
          console.log(`Agency plan recorded for ${email}`)
          break
        }

        // Only our own product's sessions. metadata is ours (set at
        // session creation), so anything else on this endpoint —
        // including future products on the same Stripe account — is
        // deliberately ignored, not errored.
        if (session.metadata?.product !== 'ai-widget') break
        const helpCenterId = session.metadata?.helpCenterId || session.client_reference_id
        if (!helpCenterId) break

        await fulfillUpgrade({
          helpCenterId,
          stripeCustomerId: typeof session.customer === 'string' ? session.customer : null,
          stripeSubscriptionId:
            typeof session.subscription === 'string' ? session.subscription : null,
        })
        updateTag(AI_WIDGET_TAG)
        console.log(`AI widget upgraded for help centre ${helpCenterId}`)
        break
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object

        // Agency plan over: the marketing checkout stamps its subscriptions
        // with the same product marker.
        if (subscription.metadata?.product === 'agency-plan') {
          await revokeAgencySubscription(subscription.id)
          updateTag(AI_WIDGET_TAG)
          console.log(`Agency plan subscription ${subscription.id} ended`)
          break
        }

        // Resolve by our stored subscription id first; metadata is the
        // fallback for events that arrive before our row was stamped.
        const { data } = await serviceClient()
          .from('ai_widget_installs')
          .select('help_center_id')
          .eq('stripe_subscription_id', subscription.id)
          .maybeSingle()
        const helpCenterId = data?.help_center_id ?? subscription.metadata?.helpCenterId
        if (!helpCenterId) break

        await fulfillCancellation(helpCenterId)
        updateTag(AI_WIDGET_TAG)
        console.log(`AI widget subscription ended for help centre ${helpCenterId}`)
        break
      }

      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.trial_will_end': {
        const eventSubscription = event.data.object
        if (eventSubscription.metadata?.product !== 'agency-plan') break

        // Sync from a fresh retrieve, never the event payload: Stripe does
        // not guarantee delivery order, and a 500'd delivery is redelivered
        // much later. A stale cancel-then-resume pair replayed backwards
        // would otherwise write cancel_at_period_end=true over a live
        // subscription — and send a "you will not be charged" email while a
        // charge is coming. Retrieving makes every delivery converge on
        // Stripe's current truth, whatever order events arrive in.
        const subscription = await stripeClient().subscriptions.retrieve(eventSubscription.id)

        if (subscription.status === 'canceled' || subscription.status === 'incomplete_expired') {
          // The deleted event was missed or is still in flight: run the
          // full downgrade rather than caching a 'canceled' status the
          // reconcile sweep's filter would never revisit.
          await revokeAgencySubscription(subscription.id)
          updateTag(AI_WIDGET_TAG)
          break
        }

        await syncAgencySubscription(subscription)

        const row = await agencyRowForSubscription(subscription.id)
        if (!row) break

        if (subscription.cancel_at_period_end) {
          // A scheduled cancellation deserves written proof that no charge
          // is coming. Resuming clears the stamp so a later second cancel
          // gets its own confirmation.
          await sendTrialCanceledEmail(row)
        } else {
          if (row.canceled_email_sent_at) await clearCanceledStamp(subscription.id)
          // Any update landing inside the reminder window doubles as the
          // trial_will_end backstop — including the cancel-then-resume-at-
          // the-last-minute case, where the promised warning would
          // otherwise be skipped entirely.
          if (needsTrialReminder({ ...row, status: 'trialing', cancel_at_period_end: false }, new Date()) &&
              subscription.status === 'trialing') {
            await sendTrialEndingEmail(row)
          }
        }
        break
      }

      case 'invoice.payment_failed': {
        // Only marks our cached status; Stripe's smart retries own the
        // dunning. Entitlement survives past_due — access ends at deletion.
        const invoice = event.data.object
        const subscriptionId = subscriptionIdFromInvoice(invoice)
        if (!subscriptionId) break

        const { error } = await serviceClient()
          .from('agency_subscriptions')
          .update({ status: 'past_due' })
          .eq('stripe_subscription_id', subscriptionId)
          .in('status', ['trialing', 'active'])
        if (error) throw new Error(`Could not mark past_due: ${error.message}`)
        break
      }

      default:
        break
    }
  } catch (error) {
    console.error(`Stripe webhook handler failed for ${event.type}:`, error)
    // 500 on purpose: Stripe redelivers, and both handlers are idempotent.
    return NextResponse.json({ error: 'handler failed' }, { status: 500 })
  }

  return NextResponse.json({ received: true })
}

type AgencyRow = {
  id: string
  email: string
  trial_end: string | null
  current_period_end: string | null
  amount: number | null
  currency: string | null
  canceled_email_sent_at: string | null
  reminder_email_sent_at: string | null
}

/** The cached row for a Stripe subscription id, with what the emails need. */
async function agencyRowForSubscription(stripeSubscriptionId: string): Promise<AgencyRow | null> {
  const { data, error } = await serviceClient()
    .from('agency_subscriptions')
    .select('id, email, trial_end, current_period_end, amount, currency, canceled_email_sent_at, reminder_email_sent_at')
    .eq('stripe_subscription_id', stripeSubscriptionId)
    .maybeSingle()
  if (error) throw new Error(`Could not read the agency subscription: ${error.message}`)
  return data
}

async function clearCanceledStamp(stripeSubscriptionId: string): Promise<void> {
  const { error } = await serviceClient()
    .from('agency_subscriptions')
    .update({ canceled_email_sent_at: null })
    .eq('stripe_subscription_id', stripeSubscriptionId)
  if (error) throw new Error(`Could not clear the cancellation stamp: ${error.message}`)
}

/**
 * The subscription id off an invoice. Basil moved it under parent details;
 * older API shapes carried a top-level string — accept both.
 */
function subscriptionIdFromInvoice(invoice: Stripe.Invoice): string | null {
  const parent = invoice.parent?.subscription_details?.subscription
  if (typeof parent === 'string') return parent
  if (parent && typeof parent === 'object') return parent.id
  const legacy = (invoice as { subscription?: unknown }).subscription
  return typeof legacy === 'string' ? legacy : null
}
