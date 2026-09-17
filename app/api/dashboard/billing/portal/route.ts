import { NextResponse } from 'next/server'
import { currentActor } from '@/lib/authz/authorize'
import { getOwnedCenter } from '@/lib/dashboard/owned-center'
import { isCentreOwner } from '@/lib/dashboard/centre-owner'
import { findEntitlementForCenter } from '@/lib/agency-plan/entitlement'
import { serviceClient } from '@/lib/db/client'
import { isCompSubscription } from '@/lib/agency-plan/subscription-sync'
import { stripeClient } from '@/lib/ai-widget/billing'
import { requestOrigin } from '@/lib/signup/origin'

/**
 * A Stripe billing-portal session for the signed-in founder: update the
 * card, download invoices. Cancellation lives in OUR UI (one click on
 * /dashboard/billing), but the portal offers it too — belt and braces.
 *
 * Serves whichever Stripe customer this centre has: the Agency AI plan's,
 * or the widget upgrade's. Comp rows have no Stripe customer and 409.
 */
export async function POST() {
  const center = await getOwnedCenter()
  if (!center) return NextResponse.json({ error: 'no help centre' }, { status: 401 })

  const actor = await currentActor()
  if (!(await isCentreOwner(center.id, actor.userId))) {
    return NextResponse.json({ error: 'owner only' }, { status: 403 })
  }

  if (!process.env.STRIPE_SECRET_KEY) {
    return NextResponse.json({ error: 'billing not configured' }, { status: 503 })
  }

  const entitlement = await findEntitlementForCenter(center.id)
  // The repository's WidgetInstall omits billing columns; read them directly.
  const { data: install } = await serviceClient()
    .from('ai_widget_installs')
    .select('stripe_customer_id')
    .eq('help_center_id', center.id)
    .maybeSingle()

  const customerId =
    (entitlement && !isCompSubscription(entitlement.stripe_subscription_id)
      ? entitlement.stripe_customer_id
      : null) ?? install?.stripe_customer_id ?? null

  if (!customerId) {
    return NextResponse.json({ error: 'no billing account for this centre' }, { status: 409 })
  }

  const origin = await requestOrigin()
  const session = await stripeClient().billingPortal.sessions.create({
    customer: customerId,
    return_url: `${origin}/dashboard/billing`,
  })

  return NextResponse.json({ url: session.url }, { headers: { 'cache-control': 'no-store' } })
}
