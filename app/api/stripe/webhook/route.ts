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

/**
 * Stripe events for the AI widget subscription.
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
          await recordAgencySubscription({
            email,
            stripeCustomerId: typeof session.customer === 'string' ? session.customer : null,
            stripeSubscriptionId:
              typeof session.subscription === 'string' ? session.subscription : session.id,
          })
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
