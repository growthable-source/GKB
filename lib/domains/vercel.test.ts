import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { VercelDomainError, addDomainToVercel, isVercelDomainsConfigured } from './vercel'

const ORIGINAL_ENV = { ...process.env }

/** Stands in for a fetch Response without pulling in a DOM environment. */
function reply(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as Response
}

function stubFetch(response: Response | Error) {
  const fetchMock = vi.fn<(url: URL, init?: RequestInit) => Promise<Response>>(() =>
    response instanceof Error ? Promise.reject(response) : Promise.resolve(response),
  )
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

beforeEach(() => {
  process.env.VERCEL_TOKEN = 'tok_test'
  process.env.VERCEL_PROJECT_ID = 'prj_test'
  process.env.VERCEL_TEAM_ID = 'team_test'
})

afterEach(() => {
  vi.unstubAllGlobals()
  process.env = { ...ORIGINAL_ENV }
})

describe('isVercelDomainsConfigured', () => {
  it('is true when token, project and team are all set', () => {
    expect(isVercelDomainsConfigured()).toBe(true)
  })

  it('is false without a token', () => {
    delete process.env.VERCEL_TOKEN
    expect(isVercelDomainsConfigured()).toBe(false)
  })

  it('is false without a project id', () => {
    delete process.env.VERCEL_PROJECT_ID
    expect(isVercelDomainsConfigured()).toBe(false)
  })

  // The team id is what the API call actually needs to resolve scope —
  // without it every request 403s with a bare "Not authorized", which
  // reads to the customer like their DNS is wrong.
  it('is false without a team id', () => {
    delete process.env.VERCEL_TEAM_ID
    expect(isVercelDomainsConfigured()).toBe(false)
  })
})

describe('VercelDomainError.isCredentialProblem', () => {
  it('is true for 401 and 403 — our token, not the customer', () => {
    expect(new VercelDomainError('Not authorized', 403).isCredentialProblem).toBe(true)
    expect(new VercelDomainError('Invalid token', 401).isCredentialProblem).toBe(true)
  })

  it('is false for errors the customer can act on', () => {
    expect(new VercelDomainError('domain in use', 409).isCredentialProblem).toBe(false)
    expect(new VercelDomainError('Could not reach Vercel', null).isCredentialProblem).toBe(false)
  })
})

describe('addDomainToVercel', () => {
  it('passes teamId so the token resolves against the right scope', async () => {
    const fetchMock = stubFetch(reply(200, {}))
    await addDomainToVercel('help.acme.com')
    const url = fetchMock.mock.calls[0][0]
    expect(url.searchParams.get('teamId')).toBe('team_test')
    expect(url.pathname).toBe('/v10/projects/prj_test/domains')
  })

  it('treats already-attached-to-this-project as success', async () => {
    stubFetch(reply(409, { error: { code: 'domain_already_in_use', message: 'used by this project' } }))
    await expect(addDomainToVercel('help.acme.com')).resolves.toBeUndefined()
  })

  it('flags a 403 as a credential problem and carries the status', async () => {
    stubFetch(reply(403, { error: { message: 'Not authorized' } }))
    await expect(addDomainToVercel('help.acme.com')).rejects.toMatchObject({
      status: 403,
      isCredentialProblem: true,
    })
  })

  it('passes through an error the customer can act on', async () => {
    stubFetch(reply(409, { error: { code: 'domain_already_in_use', message: 'used by another account' } }))
    await expect(addDomainToVercel('help.acme.com')).rejects.toMatchObject({
      status: 409,
      message: 'used by another account',
      isCredentialProblem: false,
    })
  })

  // A network failure leaves the attach outcome genuinely unknown, so it
  // must stay distinguishable from a definitive HTTP rejection — the
  // caller keeps the pending row in that case instead of rolling back.
  it('reports an unreachable Vercel with a null status', async () => {
    stubFetch(new Error('socket hang up'))
    await expect(addDomainToVercel('help.acme.com')).rejects.toMatchObject({ status: null })
  })
})
