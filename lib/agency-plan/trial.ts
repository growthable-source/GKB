/**
 * Pure trial arithmetic and wording, shared by the dashboard banner, the
 * billing page, the reminder emails, and the reconcile sweep. Everything
 * takes `now` explicitly so it can be unit-tested and so the cron and a
 * request render can never disagree about "today".
 */

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * Whole days until the trial ends, rounded up: a trial ending in 90 minutes
 * is "1 day left", never "0 days left" while access still works. Returns 0
 * once the moment has passed.
 */
export function trialDaysLeft(trialEnd: string, now: Date): number {
  const remaining = new Date(trialEnd).getTime() - now.getTime()
  if (remaining <= 0) return 0
  return Math.ceil(remaining / DAY_MS)
}

/** "$197" — cents to a whole-dollar label, the way the plan is marketed. */
export function amountLabel(amount: number | null, currency: string | null): string {
  if (amount == null) return ''
  const dollars = amount / 100
  const symbol = !currency || currency.toLowerCase() === 'usd' ? '$' : `${currency.toUpperCase()} `
  return Number.isInteger(dollars) ? `${symbol}${dollars}` : `${symbol}${dollars.toFixed(2)}`
}

/**
 * "21 August 2026" — long-form, unambiguous across US/AU date conventions.
 *
 * Rendered in UTC-12 (Anywhere-on-Earth), deliberately: the charge fires at
 * an instant, and every email and banner promises "cancel any time before
 * {date}". AoE names the earliest calendar date that instant falls on in any
 * timezone, so the promise is safe for every customer — cancelling before
 * the stated date always beats the charge. The cost is that customers east
 * of UTC-12 may see the charge a calendar day after the stated date, which
 * errs on the side of warning early, never late.
 */
export function chargeDateLabel(isoDate: string): string {
  return new Date(isoDate).toLocaleDateString('en-AU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Etc/GMT+12',
  })
}

export type ReminderCandidate = {
  status: string
  trial_end: string | null
  cancel_at_period_end: boolean
  reminder_email_sent_at: string | null
}

/** How far ahead the reminder goes out. Matches Stripe's trial_will_end lead. */
export const REMINDER_LEAD_DAYS = 3

/**
 * Whether the reconcile sweep owes this row a trial-ending reminder: still
 * trialing, ending within the lead window but not already over, not already
 * cancelled (no charge coming — nothing to warn about), and not already sent.
 * The webhook path stamps reminder_email_sent_at too, so whichever of
 * trial_will_end or the sweep runs first wins and the other stays silent.
 */
export function needsTrialReminder(row: ReminderCandidate, now: Date): boolean {
  if (row.status !== 'trialing') return false
  if (!row.trial_end) return false
  if (row.cancel_at_period_end) return false
  if (row.reminder_email_sent_at) return false

  const daysLeft = trialDaysLeft(row.trial_end, now)
  return daysLeft > 0 && daysLeft <= REMINDER_LEAD_DAYS
}
