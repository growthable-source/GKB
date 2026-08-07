import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  XoveraError,
  cancelInstall,
  getInstall,
  isXoveraConfigured,
  mintBuilderLink,
  provisionInstall,
} from './client'

const ORIGINAL_ENV = { ...process.env }

/** Stands in for a fetch Response without pulling in a DOM environment. */
function reply(status: number, body: unknown): Response {
  const text = typeof body === 'string' ? body : JSON.stringify(body)
  return {
    ok: status >= 200 && status < 300,
    status,
    text: () => Promise.resolve(text),
  } as Response
}

/** The signature is declared, not implemented, so `mock.calls` stays indexable. */
function stubFetch(response: Response | Error) {
  const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(() =>
    response instanceof Error ? Promise.reject(response) : Promise.resolve(response),
  )
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

beforeEach(() => {
  process.env.XOVERA_API_KEY = 'vox_test_key'
  process.env.XOVERA_BASE_URL = 'https://app.xovera.test'
})

afterEach(() => {
  vi.unstubAllGlobals()
  process.env = { ...ORIGINAL_ENV }
})

describe('isXoveraConfigured', () => {
  it('is false without a key, so the UI can hide the upsell rather than fail on click', () => {
    delete process.env.XOVERA_API_KEY
    expect(isXoveraConfigured()).toBe(false)
  })

  it('is true with a key', () => {
    expect(isXoveraConfigured()).toBe(true)
  })
})

describe('provisionInstall', () => {
  it('sends the bearer key and unwraps the data envelope', async () => {
    const fetchMock = stubFetch(
      reply(200, {
        data: {
          installId: 'clx1',
          created: true,
          workspaceId: 'clx2',
          widget: { id: 'clx3', publicKey: 'widget_pub_abc' },
          embedSnippet: '<script src="https://cdn.xovera.test/widget.js"></script>',
          builderUrl: 'https://app.xovera.test/embedded/widget-builder?t=tok',
          trialEndsAt: '2026-08-21T00:00:00.000Z',
        },
      }),
    )

    const result = await provisionInstall({
      externalId: 'hc_abc',
      email: 'owner@acme.com',
      businessName: 'Acme Ltd',
      helpCenterUrl: 'https://help.acme.com',
    })

    expect(result.workspaceId).toBe('clx2')
    expect(result.created).toBe(true)

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://app.xovera.test/api/v1/partner/installs')
    expect(init?.method).toBe('POST')
    expect((init?.headers as Record<string, string>).authorization).toBe('Bearer vox_test_key')
    expect(JSON.parse(init?.body as string)).toMatchObject({
      externalId: 'hc_abc',
      helpCenterUrl: 'https://help.acme.com',
    })
  })

  it('strips a trailing slash from the base URL rather than double-slashing the path', async () => {
    process.env.XOVERA_BASE_URL = 'https://app.xovera.test/'
    const fetchMock = stubFetch(reply(200, { data: {} }))

    await getInstall('hc_abc')

    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://app.xovera.test/api/v1/partner/installs/hc_abc',
    )
  })

  it('raises a non-retryable not_configured before touching the network when the key is missing', async () => {
    delete process.env.XOVERA_API_KEY
    const fetchMock = stubFetch(reply(200, { data: {} }))

    const error = await provisionInstall({
      externalId: 'hc_abc',
      email: 'a@b.com',
      businessName: 'Acme',
      helpCenterUrl: 'https://help.acme.com',
    }).catch((e: unknown) => e as XoveraError)

    expect(error).toBeInstanceOf(XoveraError)
    expect((error as XoveraError).code).toBe('not_configured')
    expect((error as XoveraError).retryable).toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('error mapping', () => {
  const cases: [number, string, string, boolean][] = [
    [401, 'unauthorized', 'unauthorized', false],
    [403, 'forbidden', 'forbidden', false],
    [422, 'bad_param', 'bad_param', false],
    [429, 'rate_limited', 'rate_limited', true],
    [409, 'not_ready', 'not_ready', true],
    [409, 'disabled', 'disabled', false],
    [503, 'not_configured', 'not_configured', false],
    [503, 'migration_pending', 'migration_pending', false],
  ]

  it.each(cases)('maps %i/%s to %s', async (status, code, expected, retryable) => {
    stubFetch(reply(status, { error: { code, message: 'nope' } }))

    const error = (await getInstall('hc_abc').catch((e: unknown) => e)) as XoveraError

    expect(error).toBeInstanceOf(XoveraError)
    expect(error.code).toBe(expected)
    expect(error.retryable).toBe(retryable)
    expect(error.status).toBe(status)
    expect(error.message).toBe('nope')
  })

  it('separates the two 409s and the two 503s by body code, not status', async () => {
    // The status alone cannot tell "poll until ready" from "re-provision", nor
    // "alert Ryan about env" from "alert Ryan about migrations".
    stubFetch(reply(409, { error: { code: 'disabled', message: 'install disabled' } }))
    const disabled = (await mintBuilderLink('hc_abc').catch((e: unknown) => e)) as XoveraError
    expect(disabled.code).toBe('disabled')
    expect(disabled.retryable).toBe(false)
  })

  it('falls back to the status when the body carries no known code', async () => {
    stubFetch(reply(429, 'Too Many Requests'))
    const error = (await getInstall('hc_abc').catch((e: unknown) => e)) as XoveraError
    expect(error.code).toBe('rate_limited')
    expect(error.message).toBe('Xovera returned 429')
  })

  it('treats an unrecognised status as unknown and does not invite a retry', async () => {
    stubFetch(reply(500, 'boom'))
    const error = (await getInstall('hc_abc').catch((e: unknown) => e)) as XoveraError
    expect(error.code).toBe('unknown')
    expect(error.retryable).toBe(false)
  })

  it('classifies a transport failure as retryable, because provisioning is idempotent', async () => {
    stubFetch(new Error('The operation was aborted due to timeout'))
    const error = (await getInstall('hc_abc').catch((e: unknown) => e)) as XoveraError
    expect(error.code).toBe('network')
    expect(error.retryable).toBe(true)
  })

  it('does not pass an unreadable 200 body off as success', async () => {
    stubFetch(reply(200, 'not json'))
    const error = (await getInstall('hc_abc').catch((e: unknown) => e)) as XoveraError
    expect(error).toBeInstanceOf(XoveraError)
    expect(error.code).toBe('unknown')
  })
})

describe('path building', () => {
  it('escapes the external id in every path it appears in', async () => {
    const fetchMock = stubFetch(reply(200, { data: {} }))

    await mintBuilderLink('hc_a/b')
    await cancelInstall('hc_a/b')

    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://app.xovera.test/api/v1/partner/installs/hc_a%2Fb/builder-link',
    )
    expect(fetchMock.mock.calls[1][0]).toBe(
      'https://app.xovera.test/api/v1/partner/installs/hc_a%2Fb',
    )
    expect(fetchMock.mock.calls[1][1]?.method).toBe('DELETE')
  })
})
