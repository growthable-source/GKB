import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getOwnedCenter } from '@/lib/dashboard/owned-center'
import { currentActor } from '@/lib/authz/authorize'
import { isCentreOwner } from '@/lib/dashboard/centre-owner'
import { findEntitlementForCenter } from '@/lib/agency-plan/entitlement'
import { isCompSubscription } from '@/lib/agency-plan/subscription-sync'
import { serviceClient } from '@/lib/db/client'
import { amountLabel, chargeDateLabel, trialDaysLeft } from '@/lib/agency-plan/trial'
import {
  CancelPlanButton,
  ResumePlanButton,
  StripePortalButton,
} from '@/components/dashboard/billing-manager'
import { cancelAgencyPlan, resumeAgencyPlan } from './actions'

export const metadata = { title: 'Billing — Growthable' }

// Billing must never render from a stale cache: a customer checking whether
// their cancellation took is the one page where "eventually right" is wrong.
export const dynamic = 'force-dynamic'

const CARD = 'rounded-lg border border-neutral-200 bg-white p-5'

export default async function BillingPage() {
  const center = await getOwnedCenter()
  if (!center) redirect('/get/details')

  const actor = await currentActor()
  const isOwner = await isCentreOwner(center.id, actor.userId)

  const entitlement = await findEntitlementForCenter(center.id)
  const { data: install } = await serviceClient()
    .from('ai_widget_installs')
    .select('billing_status, stripe_customer_id')
    .eq('help_center_id', center.id)
    .maybeSingle()

  const comped = entitlement ? isCompSubscription(entitlement.stripe_subscription_id) : false
  const now = new Date()
  // Clock-at-zero rows are converted-but-unsynced: never show trial promises
  // ("cancel before X — no charge") once the conversion instant has passed.
  const trialing =
    entitlement?.status === 'trialing' &&
    Boolean(entitlement.trial_end) &&
    trialDaysLeft(entitlement!.trial_end!, now) > 0
  const daysLeft = trialing ? trialDaysLeft(entitlement!.trial_end!, now) : null
  const price =
    entitlement?.amount != null
      ? `${amountLabel(entitlement.amount, entitlement.currency)}/${entitlement.billing_interval ?? 'month'}`
      : null
  const chargeDate = trialing
    ? chargeDateLabel(entitlement!.trial_end!)
    : entitlement?.current_period_end
      ? chargeDateLabel(entitlement.current_period_end)
      : null

  const hasStripeCustomer =
    (entitlement && !comped && entitlement.stripe_customer_id) || install?.stripe_customer_id

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Billing</h1>
        <p className="mt-1 text-sm text-neutral-600">
          What you&apos;re on, what it costs, and where to cancel. No surprises.
        </p>
      </div>

      {/* ——— Agency AI plan ——— */}
      {entitlement && entitlement.status !== 'canceled' ? (
        <section className={CARD}>
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-medium">Agency AI plan</h2>
            {trialing && !entitlement.cancel_at_period_end && (
              <span className="rounded-full border border-amber-300 bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-900">
                Free trial — {daysLeft} {daysLeft === 1 ? 'day' : 'days'} left
              </span>
            )}
            {trialing && entitlement.cancel_at_period_end && (
              <span className="rounded-full border border-neutral-300 bg-neutral-100 px-2.5 py-0.5 text-xs font-semibold text-neutral-700">
                Cancelled — no charge coming
              </span>
            )}
            {entitlement.status === 'active' && !entitlement.cancel_at_period_end && (
              <span className="rounded-full border border-green-300 bg-green-50 px-2.5 py-0.5 text-xs font-semibold text-green-900">
                Active
              </span>
            )}
            {entitlement.status === 'active' && entitlement.cancel_at_period_end && (
              <span className="rounded-full border border-neutral-300 bg-neutral-100 px-2.5 py-0.5 text-xs font-semibold text-neutral-700">
                Ends {entitlement.current_period_end ? chargeDateLabel(entitlement.current_period_end) : 'soon'}
              </span>
            )}
            {entitlement.status === 'past_due' && (
              <span className="rounded-full border border-red-300 bg-red-50 px-2.5 py-0.5 text-xs font-semibold text-red-900">
                Payment issue
              </span>
            )}
          </div>

          <div className="mt-3 text-sm text-neutral-700">
            {comped ? (
              <p>Set up by the Growthable team — nothing is ever charged for this plan.</p>
            ) : trialing && !entitlement.cancel_at_period_end ? (
              <p>
                Your trial is free until <span className="font-medium">{chargeDate}</span>.
                {price && (
                  <>
                    {' '}
                    On that date your card is charged{' '}
                    <span className="font-medium">{price}</span> — cancel any time before and
                    you won&apos;t be charged at all.
                  </>
                )}
              </p>
            ) : entitlement.status === 'past_due' ? (
              <p>
                Your last payment didn&apos;t go through. Update your card below — access
                continues while the payment retries. Cancelling now stops the subscription
                today and voids the outstanding payment.
              </p>
            ) : entitlement.cancel_at_period_end ? (
              <p>
                Cancelled — <span className="font-medium">you won&apos;t be charged</span>.
                Everything keeps working until{' '}
                <span className="font-medium">{chargeDate ?? 'the end of the period'}</span>, then
                your help centre drops to the free plan. Nothing is deleted.
              </p>
            ) : (
              <p>
                {price ? (
                  <>
                    <span className="font-medium">{price}</span>
                    {chargeDate && <>, next charge on <span className="font-medium">{chargeDate}</span></>}
                    .
                  </>
                ) : (
                  'Active subscription.'
                )}
              </p>
            )}
          </div>

          {isOwner && !comped && (
            <div className="mt-4 flex flex-wrap items-start gap-3">
              {entitlement.cancel_at_period_end && entitlement.status !== 'past_due' ? (
                <ResumePlanButton action={resumeAgencyPlan} />
              ) : (
                <CancelPlanButton
                  action={cancelAgencyPlan}
                  chargeDate={chargeDate}
                  immediate={entitlement.status === 'past_due'}
                />
              )}
              {hasStripeCustomer && <StripePortalButton />}
            </div>
          )}
          {!isOwner && (
            <p className="mt-4 text-sm text-neutral-500">
              Only the account owner can change billing.
            </p>
          )}
        </section>
      ) : (
        <section className={CARD}>
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-medium">Your plan</h2>
            <span className="rounded-full border border-neutral-300 bg-neutral-100 px-2.5 py-0.5 text-xs font-semibold text-neutral-700">
              {center.plan === 'pro' ? 'Pro' : 'Free'}
            </span>
          </div>
          <p className="mt-3 text-sm text-neutral-700">
            {center.plan === 'pro'
              ? 'Pro is active on this help centre.'
              : 'You are on the free plan — nothing is ever charged.'}{' '}
            The AI chat widget upgrade lives on the{' '}
            <Link href="/dashboard/ai-agent" className="font-medium underline">
              AI chat widget
            </Link>{' '}
            page.
          </p>
          {isOwner && install?.stripe_customer_id && (
            <div className="mt-4">
              <StripePortalButton />
            </div>
          )}
        </section>
      )}

      {/* ——— Widget subscription, when it is the thing being paid for ——— */}
      {install?.billing_status === 'paid' && !entitlement && (
        <section className={CARD}>
          <h2 className="text-lg font-medium">AI chat widget subscription</h2>
          <p className="mt-3 text-sm text-neutral-700">
            Billed monthly through Stripe. Card and invoices are in the billing portal above.
          </p>
        </section>
      )}

      <p className="text-xs text-neutral-500">
        Something not right? Email{' '}
        <a href="mailto:ryan@growthable.io" className="underline">
          ryan@growthable.io
        </a>{' '}
        and a human sorts it out.
      </p>
    </div>
  )
}
