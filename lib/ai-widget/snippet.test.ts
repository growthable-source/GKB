import { describe, expect, it } from 'vitest'
import { scriptSrcFrom } from './snippet'

const SNIPPET =
  '<script src="https://cdn.xovera.io/widget.js" data-widget-id="clx1" data-public-key="widget_pub_abc" async></script>'

describe('scriptSrcFrom', () => {
  it('reads the src out of the snippet Xovera returns', () => {
    expect(scriptSrcFrom(SNIPPET)).toBe('https://cdn.xovera.io/widget.js')
  })

  it('handles single quotes and extra whitespace around the attribute', () => {
    expect(scriptSrcFrom("<script  src = 'https://cdn.xovera.io/w.js' async></script>")).toBe(
      'https://cdn.xovera.io/w.js',
    )
  })

  it('is not fooled by an earlier data attribute containing the word src', () => {
    const snippet = '<script data-srcset="x" src="https://cdn.xovera.io/widget.js"></script>'
    expect(scriptSrcFrom(snippet)).toBe('https://cdn.xovera.io/widget.js')
  })

  it('rejects a javascript: URL', () => {
    // The whole reason this parses rather than injecting the snippet: this
    // value ends up in a script tag on every tenant's public pages.
    expect(scriptSrcFrom('<script src="javascript:alert(1)"></script>')).toBeNull()
  })

  it('rejects http and other non-https schemes', () => {
    expect(scriptSrcFrom('<script src="http://cdn.xovera.io/widget.js"></script>')).toBeNull()
    expect(scriptSrcFrom('<script src="data:text/javascript,alert(1)"></script>')).toBeNull()
  })

  it('rejects a relative URL, which we have no trusted base to resolve', () => {
    expect(scriptSrcFrom('<script src="/widget.js"></script>')).toBeNull()
  })

  it('returns null for a snippet with no src, and for no snippet at all', () => {
    expect(scriptSrcFrom('<script>alert(1)</script>')).toBeNull()
    expect(scriptSrcFrom('')).toBeNull()
    expect(scriptSrcFrom(null)).toBeNull()
    expect(scriptSrcFrom(undefined)).toBeNull()
  })
})
