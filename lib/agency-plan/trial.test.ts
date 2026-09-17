import { describe, expect, it } from 'vitest'
import {
  amountLabel,
  chargeDateLabel,
  needsTrialReminder,
  trialDaysLeft,
  REMINDER_LEAD_DAYS,
} from './trial'

const NOW = new Date('2026-08-21T00:00:00.000Z')

describe('trialDaysLeft', () => {
  it('rounds partial days up — 90 minutes left is still "1 day"', () => {
    expect(trialDaysLeft('2026-08-21T01:30:00.000Z', NOW)).toBe(1)
  })

  it('counts whole days', () => {
    expect(trialDaysLeft('2026-08-24T00:00:00.000Z', NOW)).toBe(3)
  })

  it('never goes negative once the trial is over', () => {
    expect(trialDaysLeft('2026-08-20T00:00:00.000Z', NOW)).toBe(0)
    expect(trialDaysLeft('2026-08-21T00:00:00.000Z', NOW)).toBe(0)
  })
})

describe('amountLabel', () => {
  it('renders whole dollars without cents', () => {
    expect(amountLabel(19700, 'usd')).toBe('$197')
  })

  it('keeps cents when they exist', () => {
    expect(amountLabel(19750, 'usd')).toBe('$197.50')
  })

  it('names non-USD currencies explicitly', () => {
    expect(amountLabel(19700, 'aud')).toBe('AUD 197')
  })

  it('degrades to empty when the price has not synced', () => {
    expect(amountLabel(null, null)).toBe('')
  })
})

describe('chargeDateLabel', () => {
  it('is long-form and unambiguous', () => {
    expect(chargeDateLabel('2026-09-04T13:00:00.000Z')).toBe('4 September 2026')
  })

  it('names the Anywhere-on-Earth date, so "cancel before {date}" is safe in every timezone', () => {
    // 07:00 UTC is still the previous day in UTC-12 — the stated date must
    // never be later than the charge date any customer experiences locally.
    expect(chargeDateLabel('2026-09-04T07:00:00.000Z')).toBe('3 September 2026')
  })
})

describe('needsTrialReminder', () => {
  const base = {
    status: 'trialing',
    trial_end: '2026-08-23T00:00:00.000Z', // 2 days out
    cancel_at_period_end: false,
    reminder_email_sent_at: null,
  }

  it('wants a reminder inside the lead window', () => {
    expect(needsTrialReminder(base, NOW)).toBe(true)
  })

  it('stays quiet outside the lead window', () => {
    const soonEnough = new Date('2026-08-10T00:00:00.000Z')
    expect(needsTrialReminder(base, soonEnough)).toBe(false)
  })

  it('stays quiet once the trial is over', () => {
    expect(needsTrialReminder(base, new Date('2026-08-24T00:00:00.000Z'))).toBe(false)
  })

  it('stays quiet when already cancelled — no charge, nothing to warn about', () => {
    expect(needsTrialReminder({ ...base, cancel_at_period_end: true }, NOW)).toBe(false)
  })

  it('stays quiet when already sent', () => {
    expect(
      needsTrialReminder({ ...base, reminder_email_sent_at: '2026-08-20T00:00:00.000Z' }, NOW),
    ).toBe(false)
  })

  it('only fires for trialing rows', () => {
    expect(needsTrialReminder({ ...base, status: 'active' }, NOW)).toBe(false)
  })

  it('exactly at the lead boundary still reminds', () => {
    const end = new Date(NOW.getTime() + REMINDER_LEAD_DAYS * 24 * 60 * 60 * 1000).toISOString()
    expect(needsTrialReminder({ ...base, trial_end: end }, NOW)).toBe(true)
  })
})
