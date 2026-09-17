import { serviceClient } from '@/lib/db/client'
import { sendEmail, canSendEmail, EmailNotConfiguredError } from '@/lib/email/resend'
import { authLinkOrigin } from '@/lib/auth/link-origin'
import {
  trialStartedSubject,
  trialStartedText,
  trialStartedHtml,
  trialEndingSubject,
  trialEndingText,
  trialEndingHtml,
  trialCanceledSubject,
  trialCanceledText,
  trialCanceledHtml,
  type TrialEmailInput,
} from '@/lib/email/agency-trial-emails'
import { amountLabel, chargeDateLabel, trialDaysLeft } from './trial'

/**
 * Idempotent senders for the three trial-transparency emails.
 *
 * Each send CLAIMS its *_sent_at stamp first — an UPDATE guarded on the
 * column still being null — so a webhook redelivery and the daily reconcile
 * sweep can both ask for the same email and only one copy ever goes out.
 * If Resend then fails, the stamp is released and the error rethrown, so
 * the caller's retry (Stripe redelivery, next sweep) gets another go.
 */

export type TrialEmailRow = {
  id: string
  email: string
  trial_end: string | null
  current_period_end: string | null
  amount: number | null
  currency: string | null
}

type StampColumn = 'started_email_sent_at' | 'reminder_email_sent_at' | 'canceled_email_sent_at'

/** True when this call won the stamp and must do the send. */
async function claimStamp(rowId: string, column: StampColumn): Promise<boolean> {
  const patch: Partial<Record<StampColumn, string>> = { [column]: new Date().toISOString() }
  const { data, error } = await serviceClient()
    .from('agency_subscriptions')
    .update(patch)
    .eq('id', rowId)
    .is(column, null)
    .select('id')

  if (error) throw new Error(`Could not claim the ${column} stamp: ${error.message}`)
  return (data?.length ?? 0) > 0
}

async function releaseStamp(rowId: string, column: StampColumn): Promise<void> {
  const patch: Partial<Record<StampColumn, null>> = { [column]: null }
  const { error } = await serviceClient()
    .from('agency_subscriptions')
    .update(patch)
    .eq('id', rowId)
  if (error) console.error(`Could not release the ${column} stamp: ${error.message}`)
}

async function trialInput(row: TrialEmailRow): Promise<TrialEmailInput | null> {
  if (!row.trial_end) return null
  const origin = await authLinkOrigin()
  return {
    amountLabel: amountLabel(row.amount, row.currency),
    chargeDate: chargeDateLabel(row.trial_end),
    daysLeft: trialDaysLeft(row.trial_end, new Date()),
    billingUrl: `${origin}/dashboard/billing`,
  }
}

async function sendStamped(
  row: TrialEmailRow,
  column: StampColumn,
  compose: () => Promise<{ subject: string; html: string; text: string } | null>,
): Promise<void> {
  if (!canSendEmail()) {
    // In production a missing key must FAIL the caller, not swallow the
    // send: the webhook 500s, Stripe redelivers for days, and the email
    // goes out once the key is fixed. Returning quietly here would drop
    // the one warning that stands between the customer and a surprise
    // charge, permanently and silently. Dev keeps the quiet skip.
    if (process.env.NODE_ENV === 'production') throw new EmailNotConfiguredError()
    console.error(`Cannot send ${column} email for ${row.email}: RESEND_API_KEY is not set`)
    return
  }

  const composed = await compose()
  if (!composed) return

  if (!(await claimStamp(row.id, column))) return

  try {
    await sendEmail({ to: row.email, ...composed })
  } catch (error) {
    await releaseStamp(row.id, column)
    throw error
  }
}

/** Terms upfront, the moment the trial starts. Trial-less rows send nothing. */
export async function sendTrialStartedEmail(row: TrialEmailRow): Promise<void> {
  await sendStamped(row, 'started_email_sent_at', async () => {
    const input = await trialInput(row)
    if (!input) return null
    return {
      subject: trialStartedSubject(input),
      html: trialStartedHtml(input),
      text: trialStartedText(input),
    }
  })
}

/** The days-left warning before any charge. Trial-less rows send nothing. */
export async function sendTrialEndingEmail(row: TrialEmailRow): Promise<void> {
  await sendStamped(row, 'reminder_email_sent_at', async () => {
    const input = await trialInput(row)
    if (!input) return null
    return {
      subject: trialEndingSubject(input),
      html: trialEndingHtml(input),
      text: trialEndingText(input),
    }
  })
}

/**
 * Written confirmation that no charge is coming.
 *
 * Access runs to the end of the PAID-FOR period, not the trial: a customer
 * who converted months ago and cancels today must read their real end date,
 * never the long-past trial end. Sends for trial-less subscriptions too —
 * a cancellation deserves confirmation whatever the subscription's history.
 */
export async function sendTrialCanceledEmail(
  row: TrialEmailRow,
  opts?: { endedNow?: boolean },
): Promise<void> {
  await sendStamped(row, 'canceled_email_sent_at', async () => {
    const origin = await authLinkOrigin()
    const endsAt = row.current_period_end ?? row.trial_end
    const accessUntil = opts?.endedNow
      ? 'today — the failed payment has been voided and nothing further will be collected'
      : endsAt
        ? chargeDateLabel(endsAt)
        : 'the end of your current billing period'
    return {
      subject: trialCanceledSubject(),
      html: trialCanceledHtml({ accessUntil, billingUrl: `${origin}/dashboard/billing` }),
      text: trialCanceledText({ accessUntil, billingUrl: `${origin}/dashboard/billing` }),
    }
  })
}
