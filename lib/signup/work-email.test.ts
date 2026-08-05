import { describe, expect, it } from 'vitest'
import { checkWorkEmail, isWorkEmail } from './work-email'

describe('checkWorkEmail', () => {
  it('accepts a company domain', () => {
    expect(checkWorkEmail('ryan@growthable.io')).toEqual({
      ok: true,
      email: 'ryan@growthable.io',
      domain: 'growthable.io',
    })
  })

  it('lowercases and trims, so storage matches the unique index', () => {
    const result = checkWorkEmail('  Ryan@Growthable.IO ')
    expect(result).toMatchObject({ ok: true, email: 'ryan@growthable.io' })
  })

  it('rejects consumer providers by name', () => {
    const result = checkWorkEmail('someone@gmail.com')
    expect(result.ok).toBe(false)
    expect(result.ok === false && result.error).toContain('gmail.com')
  })

  it('rejects consumer providers regardless of case', () => {
    expect(isWorkEmail('Someone@GMAIL.com')).toBe(false)
  })

  it('rejects disposable addresses', () => {
    expect(isWorkEmail('x@mailinator.com')).toBe(false)
    expect(isWorkEmail('x@10minutemail.com')).toBe(false)
  })

  it('allows plus-addressing on a company domain', () => {
    expect(isWorkEmail('ryan+signup@growthable.io')).toBe(true)
  })

  it('rejects plus-addressing that still lands at a consumer provider', () => {
    expect(isWorkEmail('ryan+agency@gmail.com')).toBe(false)
  })

  it('treats a subdomain of a blocked domain as its own domain', () => {
    // mail.gmail.com is not gmail.com. Blocking by suffix would also catch
    // legitimate domains that merely end in a blocked one (notgmail.com).
    expect(isWorkEmail('x@mail.gmail.com')).toBe(true)
    expect(isWorkEmail('x@notgmail.com')).toBe(true)
  })

  it('rejects malformed addresses', () => {
    expect(isWorkEmail('')).toBe(false)
    expect(isWorkEmail('ryan')).toBe(false)
    expect(isWorkEmail('ryan@')).toBe(false)
    expect(isWorkEmail('ryan@localhost')).toBe(false)
    expect(isWorkEmail('ryan @growthable.io')).toBe(false)
    expect(isWorkEmail('a@b@growthable.io')).toBe(false)
  })
})
