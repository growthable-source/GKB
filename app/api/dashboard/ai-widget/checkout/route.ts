import { NextResponse } from 'next/server'
import { authorize, ForbiddenError } from '@/lib/authz/authorize'
import { getOwnedCenter } from '@/lib/dashboard/owned-center'
import { getInstallForCenter } from '@/lib/ai-widget/repository'
import { createUpgradeCheckout, isBillingConfigured } from '@/lib/ai-widget/billing'
import { userClient } from '@/lib/db/client'
import { requestOrigin } from '@/lib/signup/origin'

/**
 * Starts the Growthable-branded upgrade: a Stripe Checkout Session on OUR
 * account. The customer never sees Xovera billing — the webhook asserts
 * the entitlement to Xovera after payment settles.
 *
 * No parameters, same as every ai-widget route: the centre, the email,
 * and therefore the subscription's owner all come from the session.
 */
export async function POST() {
  const center = await getOwnedCenter()
  if (!center) return NextResponse.json({ error: 'Not allowed' }, { status: 403 })

  try {
    await authorize('helpCenter.update', { helpCenterId: center.id })
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return NextResponse.json({ error: 'Not allowed' }, { status: 403 })
    }
    throw error
  }

  if (!isBillingConfigured()) {
    return NextResponse.json({ error: 'Upgrades are not available yet.' }, { status: 503 })
  }

  // No install, nothing to upgrade — the button should not even render,
  // but a crafted request must not open a checkout for nothing.
  const install = await getInstallForCenter(center.id)
  if (!install || install.status !== 'ready') {
    return NextResponse.json({ error: 'Add the AI chat widget first.' }, { status: 409 })
  }

  const { data } = await (await userClient()).auth.getUser()
  const email = data.user?.email
  if (!email) {
    return NextResponse.json({ error: 'We could not read your email address.' }, { status: 401 })
  }

  try {
    const { url } = await createUpgradeCheckout({
      helpCenterId: center.id,
      email,
      origin: await requestOrigin(),
    })
    return NextResponse.json({ url }, { headers: { 'cache-control': 'no-store' } })
  } catch (error) {
    console.error(`Checkout creation failed for ${center.id}:`, error)
    return NextResponse.json(
      { error: 'We could not start the checkout. Please try again shortly.' },
      { status: 502 },
    )
  }
}
