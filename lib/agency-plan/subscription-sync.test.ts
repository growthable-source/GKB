import { describe, expect, it } from 'vitest'
import type Stripe from 'stripe'
import { isCompSubscription, mapStripeStatus, subscriptionSnapshot } from './subscription-sync'

describe('mapStripeStatus', () => {
  it('keeps the two words we share with Stripe', () => {
    expect(mapStripeStatus('trialing')).toBe('trialing')
    expect(mapStripeStatus('active')).toBe('active')
  })

  it('folds every dunning-ish state into past_due (entitlement grace)', () => {
    expect(mapStripeStatus('past_due')).toBe('past_due')
    expect(mapStripeStatus('unpaid')).toBe('past_due')
    expect(mapStripeStatus('incomplete')).toBe('past_due')
    expect(mapStripeStatus('paused')).toBe('past_due')
  })

  it('folds terminal states into canceled', () => {
    expect(mapStripeStatus('canceled')).toBe('canceled')
    expect(mapStripeStatus('incomplete_expired')).toBe('canceled')
  })
})

describe('subscriptionSnapshot', () => {
  // The fields the snapshot reads, shaped like Stripe's Basil API: the
  // period clock lives on the item, the trial clock on the subscription.
  const subscription = {
    status: 'trialing',
    trial_end: 1788048000, // 2026-08-30T00:00:00Z
    cancel_at_period_end: false,
    items: {
      data: [
        {
          current_period_end: 1788048000,
          price: { unit_amount: 19700, currency: 'usd', recurring: { interval: 'month' } },
        },
      ],
    },
  } as unknown as Stripe.Subscription

  it('extracts the full clock and price', () => {
    expect(subscriptionSnapshot(subscription)).toEqual({
      status: 'trialing',
      trialEnd: '2026-08-30T00:00:00.000Z',
      currentPeriodEnd: '2026-08-30T00:00:00.000Z',
      cancelAtPeriodEnd: false,
      amount: 19700,
      currency: 'usd',
      billingInterval: 'month',
    })
  })

  it('survives a subscription with no trial and no items', () => {
    const bare = {
      status: 'active',
      trial_end: null,
      cancel_at_period_end: true,
      items: { data: [] },
    } as unknown as Stripe.Subscription

    expect(subscriptionSnapshot(bare)).toEqual({
      status: 'active',
      trialEnd: null,
      currentPeriodEnd: null,
      cancelAtPeriodEnd: true,
      amount: null,
      currency: null,
      billingInterval: null,
    })
  })
})

describe('isCompSubscription', () => {
  it('spots staff-comped ids and leaves real ones alone', () => {
    expect(isCompSubscription('comp-3b1a2c') ).toBe(true)
    expect(isCompSubscription('sub_1QAbCdEf')).toBe(false)
  })
})
