/**
 * The three Agency AI plan transparency emails.
 *
 * The contract with the customer: they always know they are on a trial, when
 * it ends, exactly what will be charged, and that cancelling before the date
 * means no charge at all. Nobody should ever learn about the plan's price
 * from their card statement.
 *
 *   1. Trial started — terms upfront the moment the trial begins.
 *   2. Trial ending — days-left warning before any money moves.
 *   3. Cancellation confirmed — in writing, so "did it actually cancel?"
 *      never needs a support ticket.
 *
 * All senders stamp a *_sent_at column first read, so webhook redeliveries
 * and the reconcile sweep can both call these without double-sending.
 */

import {
  escapeHtml,
  emailShell,
  kickerRow,
  headlineRow,
  paragraphRow,
  buttonRow,
  footnoteRow,
  fallbackUrlRow,
  MONO,
  INK,
} from './shell'

export type TrialEmailInput = {
  /** "$197" */
  amountLabel: string
  /** "21 August 2026" */
  chargeDate: string
  /** Whole days until the trial ends. */
  daysLeft: number
  /** Absolute URL of /dashboard/billing. */
  billingUrl: string
}

const mono = (value: string) =>
  `<span style="font-family:${MONO};color:${INK};">${escapeHtml(value)}</span>`

// --- 1. Trial started -------------------------------------------------------

export function trialStartedSubject(input: TrialEmailInput): string {
  return `Your trial is live — first charge ${input.chargeDate}, cancel anytime before`
}

export function trialStartedText(input: TrialEmailInput): string {
  return [
    'Your Agency AI plan trial has started. The terms, upfront:',
    '',
    `- Your trial is free for ${input.daysLeft} days.`,
    `- On ${input.chargeDate} your card will be charged ${input.amountLabel}/month.`,
    '- Cancel any time before that date and you will not be charged a cent.',
    '- We will email you again a few days before the trial ends.',
    '',
    'Cancel or manage your plan here:',
    input.billingUrl,
    '',
    'Growthable',
  ].join('\n')
}

export function trialStartedHtml(input: TrialEmailInput): string {
  const rows = [
    kickerRow('The terms, upfront'),
    headlineRow('Your trial is live. Here is exactly what happens next.'),
    paragraphRow(
      `Your Agency AI plan trial is free for ${input.daysLeft} days. On ${mono(input.chargeDate)} your card will be charged ${mono(`${input.amountLabel}/month`)} — and cancelling any time before that date means you will not be charged at all.`,
    ),
    paragraphRow(
      `We will email you again a few days before the trial ends, so the date never sneaks up on you.`,
    ),
    buttonRow(input.billingUrl, 'Manage or cancel your trial'),
    footnoteRow(
      'The button opens your billing page — trial countdown, charge date, and a cancel button that works in one click.',
    ),
    fallbackUrlRow(input.billingUrl),
  ].join('\n')

  return emailShell({
    title: escapeHtml(trialStartedSubject(input)),
    preheader: `Free for ${input.daysLeft} days, ${input.amountLabel}/month from ${input.chargeDate}, cancel anytime before.`,
    bodyRows: rows,
  })
}

// --- 2. Trial ending --------------------------------------------------------

export function trialEndingSubject(input: TrialEmailInput): string {
  const days = input.daysLeft === 1 ? 'tomorrow' : `in ${input.daysLeft} days`
  return `Your trial ends ${days} — ${input.amountLabel} on ${input.chargeDate} unless you cancel`
}

export function trialEndingText(input: TrialEmailInput): string {
  const days = input.daysLeft === 1 ? 'tomorrow' : `in ${input.daysLeft} days`
  return [
    `Your Agency AI plan trial ends ${days}.`,
    '',
    `- On ${input.chargeDate} your card will be charged ${input.amountLabel}/month.`,
    '- Want to keep it? Do nothing — everything stays exactly as it is.',
    '- Not for you? Cancel before then and you will not be charged:',
    '',
    input.billingUrl,
    '',
    'Growthable',
  ].join('\n')
}

export function trialEndingHtml(input: TrialEmailInput): string {
  const days = input.daysLeft === 1 ? 'tomorrow' : `in ${input.daysLeft} days`
  const rows = [
    kickerRow('Heads up, no surprises'),
    headlineRow(`Your trial ends ${escapeHtml(days)}.`),
    paragraphRow(
      `On ${mono(input.chargeDate)} your card will be charged ${mono(`${input.amountLabel}/month`)} and your Agency AI plan continues uninterrupted.`,
    ),
    paragraphRow(
      `Want to keep it? Do nothing. Not for you? Cancel before then — it takes one click and you will not be charged.`,
    ),
    buttonRow(input.billingUrl, 'Manage or cancel your trial'),
    fallbackUrlRow(input.billingUrl),
  ].join('\n')

  return emailShell({
    title: escapeHtml(trialEndingSubject(input)),
    preheader: `${input.amountLabel}/month from ${input.chargeDate} unless you cancel first.`,
    bodyRows: rows,
  })
}

// --- 3. Cancellation confirmed ----------------------------------------------

export type CancelEmailInput = {
  /** "21 August 2026" — when access ends (the un-charged trial end). */
  accessUntil: string
  billingUrl: string
}

export function trialCanceledSubject(): string {
  return 'Cancelled — you will not be charged'
}

export function trialCanceledText(input: CancelEmailInput): string {
  return [
    'Your Agency AI plan is cancelled and your card will not be charged.',
    '',
    `Everything keeps working until ${input.accessUntil}, then your help centre simply drops back to the free plan. Nothing is deleted.`,
    '',
    'Change your mind before then? Resume from your billing page:',
    input.billingUrl,
    '',
    'Growthable',
  ].join('\n')
}

export function trialCanceledHtml(input: CancelEmailInput): string {
  const rows = [
    kickerRow('Confirmed in writing'),
    headlineRow('Cancelled. You will not be charged.'),
    paragraphRow(
      `Your Agency AI plan is cancelled and no charge is coming. Everything keeps working until ${mono(input.accessUntil)}, then your help centre drops back to the free plan — nothing is deleted.`,
    ),
    paragraphRow('Change your mind before then? Resuming takes one click.'),
    buttonRow(input.billingUrl, 'Open your billing page'),
    fallbackUrlRow(input.billingUrl),
  ].join('\n')

  return emailShell({
    title: escapeHtml(trialCanceledSubject()),
    preheader: 'No charge is coming. Access continues until the end of your trial.',
    bodyRows: rows,
  })
}
