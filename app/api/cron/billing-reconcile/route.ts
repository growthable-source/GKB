import { NextRequest, NextResponse } from 'next/server'
import { timingSafeEqual } from 'node:crypto'
import { serviceClient } from '@/lib/db/client'
import { stripeClient } from '@/lib/ai-widget/billing'
import { revokeAgencySubscription } from '@/lib/agency-plan/entitlement'
import {
  syncAgencySubscription,
  subscriptionSnapshot,
  isCompSubscription,
} from '@/lib/agency-plan/subscription-sync'
import { sendTrialEndingEmail } from '@/lib/agency-plan/trial-emails'
import { needsTrialReminder } from '@/lib/agency-plan/trial'

/**
 * The daily billing sweep — the backstop behind the Stripe webhook.
 *
 * Webhooks are at-least-once, not guaranteed-ever: an endpoint outage
 * outlasting Stripe's retry window, or a misconfigured secret, silently
 * strands rows. Once a day this re-reads every live subscription from
 * Stripe, re-syncs the cached clock, downgrades subscriptions Stripe says
 * are gone, and sends any trial-ending reminder the webhook path missed —
 * the email whose absence turns a conversion into a surprise charge.
 *
 * Auth: Vercel Cron sends `Authorization: Bearer ${CRON_SECRET}` when the
 * env var is set. Same convention as xovera-sync: unset secret = endpoint
 * off (404), timing-safe compare.
 *
 * Every send is stamped-idempotent (lib/agency-plan/trial-emails.ts), so
 * overlap with the webhook path can never double-send.
 */
export const maxDuration = 60

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const header = req.headers.get('authorization') ?? ''
  const presented = header.startsWith('Bearer ') ? header.slice(7) : ''
  const a = Buffer.from(presented)
  const b = Buffer.from(secret)
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Least-recently-synced first (the updated_at trigger bumps on every
  // sync), so if a run ever exhausts its time budget the SAME rows are not
  // the ones starved every day — the backlog rotates through.
  const { data: rows, error } = await serviceClient()
    .from('agency_subscriptions')
    .select('id, email, stripe_subscription_id, status, trial_end, current_period_end, cancel_at_period_end, amount, currency, reminder_email_sent_at')
    .in('status', ['trialing', 'active', 'past_due'])
    .order('updated_at', { ascending: true })

  if (error) {
    return NextResponse.json({ error: `read failed: ${error.message}` }, { status: 500 })
  }

  let synced = 0
  let reminded = 0
  let revoked = 0
  let deferred = 0
  const failures: string[] = []

  // Stop well before maxDuration: a mid-send kill would strand a claimed
  // email stamp with nothing delivered. Rows left over rotate to the front
  // of tomorrow's run via the updated_at ordering above.
  const deadline = Date.now() + 45_000

  for (const row of rows ?? []) {
    if (isCompSubscription(row.stripe_subscription_id)) continue
    if (Date.now() > deadline) {
      deferred++
      continue
    }

    try {
      const subscription = await stripeClient().subscriptions.retrieve(row.stripe_subscription_id)

      if (subscription.status === 'canceled' || subscription.status === 'incomplete_expired') {
        // The deleted webhook never landed: run the full downgrade now.
        await revokeAgencySubscription(row.stripe_subscription_id)
        revoked++
        continue
      }

      const snapshot = subscriptionSnapshot(subscription)
      await syncAgencySubscription(subscription)
      synced++

      // Decide AND compose from the freshly synced values, never the row
      // read before the sync — for a stranded row (trial_end still null in
      // the pre-sync read) the reminder would otherwise silently no-op on
      // exactly the rows this sweep exists to rescue.
      const fresh = {
        ...row,
        status: snapshot.status,
        trial_end: snapshot.trialEnd,
        current_period_end: snapshot.currentPeriodEnd,
        cancel_at_period_end: snapshot.cancelAtPeriodEnd,
        amount: snapshot.amount,
        currency: snapshot.currency,
      }
      if (needsTrialReminder(fresh, new Date())) {
        await sendTrialEndingEmail(fresh)
        reminded++
      }
    } catch (err) {
      // One broken row must not strand the rest of the sweep.
      console.error(`billing-reconcile failed for ${row.stripe_subscription_id}:`, err)
      failures.push(row.stripe_subscription_id)
    }
  }

  if (deferred > 0) {
    console.error(`billing-reconcile deferred ${deferred} rows to tomorrow (time budget)`)
  }

  return NextResponse.json({ ok: failures.length === 0, synced, reminded, revoked, deferred, failures })
}
