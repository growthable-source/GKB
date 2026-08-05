import { describe, expect, it } from 'vitest'
import { parseCenterPath } from './path'

describe('parseCenterPath', () => {
  it('parses a center home page', () => {
    expect(parseCenterPath('/hc/acme')).toEqual({
      slug: 'acme',
      basePath: '/hc/acme',
      rewriteTo: '/',
    })
  })

  it('parses a collection page', () => {
    expect(parseCenterPath('/hc/acme/billing')).toEqual({
      slug: 'acme',
      basePath: '/hc/acme',
      rewriteTo: '/billing',
    })
  })

  it('parses an article page', () => {
    expect(parseCenterPath('/hc/acme/billing/refunds')).toEqual({
      slug: 'acme',
      basePath: '/hc/acme',
      rewriteTo: '/billing/refunds',
    })
  })

  it('tolerates a trailing slash', () => {
    expect(parseCenterPath('/hc/acme/')).toMatchObject({ slug: 'acme', rewriteTo: '/' })
  })

  it('keeps hyphenated and numeric slugs', () => {
    expect(parseCenterPath('/hc/acme-2/search')).toMatchObject({
      slug: 'acme-2',
      basePath: '/hc/acme-2',
      rewriteTo: '/search',
    })
  })

  it('ignores paths that do not start with the prefix', () => {
    expect(parseCenterPath('/')).toBeNull()
    expect(parseCenterPath('/billing')).toBeNull()
    expect(parseCenterPath('/get')).toBeNull()
    expect(parseCenterPath('/admin/articles')).toBeNull()
    // A collection that merely starts with the same letters is not a center.
    expect(parseCenterPath('/hcl/acme')).toBeNull()
  })

  it('needs a slug, not just the prefix', () => {
    expect(parseCenterPath('/hc')).toBeNull()
    expect(parseCenterPath('/hc/')).toBeNull()
  })

  it('rejects slugs that slugify() could never have produced', () => {
    // Rejected here rather than handed to a database lookup.
    expect(parseCenterPath('/hc/Acme')).toBeNull()
    expect(parseCenterPath('/hc/ac me')).toBeNull()
    expect(parseCenterPath('/hc/-acme')).toBeNull()
    expect(parseCenterPath('/hc/acme%20co')).toBeNull()
    expect(parseCenterPath('/hc/../admin')).toBeNull()
  })
})
