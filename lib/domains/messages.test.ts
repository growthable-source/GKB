import { afterEach, describe, expect, it, vi } from 'vitest'
import { VercelDomainError } from './vercel'
import { domainErrorMessage, reportDomainFailure } from './messages'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('domainErrorMessage', () => {
  it('owns a credential rejection instead of blaming the customer', () => {
    const message = domainErrorMessage(new VercelDomainError('Not authorized', 403), 'attach')
    expect(message).toMatch(/hosting credentials were rejected/)
    expect(message).toMatch(/Nothing to fix on your side/)
  })

  it('passes through what the customer can act on', () => {
    const message = domainErrorMessage(
      new VercelDomainError('Domain is already in use by another account', 409),
      'attach',
    )
    expect(message).toBe('Could not attach the domain: Domain is already in use by another account')
  })

  it('names the verb it failed at', () => {
    expect(domainErrorMessage(new VercelDomainError('boom', 500), 'check')).toMatch(/Could not check/)
    expect(domainErrorMessage(new VercelDomainError('boom', 500), 'detach')).toMatch(/Could not detach/)
  })
})

describe('reportDomainFailure', () => {
  it('logs the raw status and message so we see it before a customer does', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    reportDomainFailure(new VercelDomainError('Not authorized', 403), 'check', 'help.acme.com')
    expect(spy).toHaveBeenCalledWith(
      '[domains] check failed for help.acme.com',
      { status: 403, message: 'Not authorized' },
    )
  })

  it('still returns the customer-facing wording', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const message = reportDomainFailure(new VercelDomainError('Not authorized', 401), 'attach', 'help.acme.com')
    expect(message).toMatch(/hosting credentials were rejected/)
  })
})
