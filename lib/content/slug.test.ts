import { describe, expect, it } from 'vitest'
import { slugify, uniqueSlug } from './slug'

describe('slugify', () => {
  it('lowercases and hyphenates', () => {
    expect(slugify('Cancel Your Subscription')).toBe('cancel-your-subscription')
  })

  it('strips punctuation and collapses separators', () => {
    expect(slugify("What's new -- in v2.0?")).toBe('what-s-new-in-v2-0')
  })

  it('trims leading and trailing hyphens', () => {
    expect(slugify('  --Billing--  ')).toBe('billing')
  })

  it('falls back for input with no usable characters', () => {
    expect(slugify('!!!')).toBe('untitled')
  })

  it('truncates to 80 characters without a trailing hyphen', () => {
    const result = slugify('a'.repeat(100))
    expect(result).toHaveLength(80)
    expect(result.endsWith('-')).toBe(false)
  })
})

describe('uniqueSlug', () => {
  it('returns the base slug when it is free', () => {
    expect(uniqueSlug('billing', [])).toBe('billing')
  })

  it('appends the first free numeric suffix', () => {
    expect(uniqueSlug('billing', ['billing'])).toBe('billing-2')
    expect(uniqueSlug('billing', ['billing', 'billing-2'])).toBe('billing-3')
  })
})
