import { describe, expect, it } from 'vitest'
import {
  trialCanceledHtml,
  trialCanceledText,
  trialEndingHtml,
  trialEndingSubject,
  trialEndingText,
  trialStartedHtml,
  trialStartedSubject,
  trialStartedText,
} from './agency-trial-emails'

const input = {
  amountLabel: '$197',
  chargeDate: '4 September 2026',
  daysLeft: 14,
  billingUrl: 'https://whitelabelghl.growthable.io/dashboard/billing',
}

describe('trial started email', () => {
  it('puts the full terms in the subject line itself', () => {
    expect(trialStartedSubject(input)).toContain('4 September 2026')
    expect(trialStartedSubject(input)).toContain('cancel anytime')
  })

  it('states amount, date, and the no-charge promise in both parts', () => {
    for (const body of [trialStartedText(input), trialStartedHtml(input)]) {
      expect(body).toContain('$197')
      expect(body).toContain('4 September 2026')
      expect(body).toContain(input.billingUrl)
    }
  })
})

describe('trial ending email', () => {
  it('says "tomorrow" for one day, days otherwise', () => {
    expect(trialEndingSubject({ ...input, daysLeft: 1 })).toContain('tomorrow')
    expect(trialEndingSubject({ ...input, daysLeft: 3 })).toContain('in 3 days')
  })

  it('names the exact charge in the subject', () => {
    expect(trialEndingSubject(input)).toContain('$197 on 4 September 2026')
  })

  it('carries the cancel link in both parts', () => {
    expect(trialEndingText(input)).toContain(input.billingUrl)
    expect(trialEndingHtml(input)).toContain(input.billingUrl)
  })
})

describe('cancellation confirmed email', () => {
  const cancelInput = { accessUntil: '4 September 2026', billingUrl: input.billingUrl }

  it('promises no charge, in writing, in both parts', () => {
    expect(trialCanceledText(cancelInput)).toContain('will not be charged')
    expect(trialCanceledHtml(cancelInput)).toContain('You will not be charged.')
  })

  it('names when access ends', () => {
    expect(trialCanceledText(cancelInput)).toContain('4 September 2026')
    expect(trialCanceledHtml(cancelInput)).toContain('4 September 2026')
  })
})

describe('escaping', () => {
  it('escapes attacker-ish content in URLs', () => {
    const hostile = { ...input, billingUrl: 'https://x.test/?a="<script>alert(1)</script>' }
    expect(trialEndingHtml(hostile)).not.toContain('<script>alert(1)</script>')
  })
})
