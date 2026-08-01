import { describe, expect, it } from 'vitest'
import { DEFAULT_NEXT, safeNext } from './safe-next'

describe('safeNext', () => {
  it('allows a same-origin relative path', () => {
    expect(safeNext('/admin/collections')).toBe('/admin/collections')
    expect(safeNext('/admin/articles?tab=drafts')).toBe('/admin/articles?tab=drafts')
  })

  it('falls back when absent or empty', () => {
    expect(safeNext(null)).toBe(DEFAULT_NEXT)
    expect(safeNext(undefined)).toBe(DEFAULT_NEXT)
    expect(safeNext('')).toBe(DEFAULT_NEXT)
  })

  // SECURITY: each of these would otherwise send a freshly signed-in user to a
  // host we do not control, using a link that appears to be on our own domain.
  it('rejects absolute urls', () => {
    expect(safeNext('https://evil.example/steal')).toBe(DEFAULT_NEXT)
    expect(safeNext('http://evil.example')).toBe(DEFAULT_NEXT)
  })

  it('rejects protocol-relative urls', () => {
    expect(safeNext('//evil.example/steal')).toBe(DEFAULT_NEXT)
    expect(safeNext('/\\evil.example')).toBe(DEFAULT_NEXT)
  })

  it('rejects scheme-bearing values that are not paths', () => {
    expect(safeNext('javascript:alert(1)')).toBe(DEFAULT_NEXT)
    expect(safeNext('mailto:someone@example.com')).toBe(DEFAULT_NEXT)
    expect(safeNext('admin/articles')).toBe(DEFAULT_NEXT)
  })
})
