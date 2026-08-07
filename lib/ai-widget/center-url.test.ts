import { describe, expect, it } from 'vitest'
import { helpCenterUrl } from './center-url'

describe('helpCenterUrl', () => {
  it('prefers a verified custom domain, which is the address visitors actually load', () => {
    expect(helpCenterUrl('https://app.growthable.io', 'acme', 'help.acme.com')).toBe(
      'https://help.acme.com',
    )
  })

  it('falls back to the path-addressed URL on our own host', () => {
    expect(helpCenterUrl('https://app.growthable.io', 'acme', null)).toBe(
      'https://app.growthable.io/hc/acme',
    )
  })

  it('does not double up the slash when the origin carries a trailing one', () => {
    // This lands in Xovera's origin allowlist, so a malformed URL here is a
    // widget that silently refuses to load.
    expect(helpCenterUrl('https://app.growthable.io/', 'acme', null)).toBe(
      'https://app.growthable.io/hc/acme',
    )
  })

  it('works against a local origin, so provisioning is testable off production', () => {
    expect(helpCenterUrl('http://localhost:3000', 'acme', null)).toBe(
      'http://localhost:3000/hc/acme',
    )
  })
})
