import sanitizeHtml from 'sanitize-html'
import { describe, expect, it } from 'vitest'
import { htmlToText, sanitizeArticleHtml } from './html'

describe('sanitizeArticleHtml', () => {
  it('keeps prose markup', () => {
    const html = '<h2>Steps</h2><p>Click <strong>Save</strong>.</p><ul><li>One</li></ul>'
    expect(sanitizeArticleHtml(html)).toBe(html)
  })

  it('removes script tags and their contents', () => {
    expect(sanitizeArticleHtml('<p>Hi</p><script>alert(1)</script>')).toBe('<p>Hi</p>')
  })

  it('strips event handler attributes', () => {
    expect(sanitizeArticleHtml('<p onclick="steal()">Hi</p>')).toBe('<p>Hi</p>')
  })

  it('rejects javascript: urls on links', () => {
    expect(sanitizeArticleHtml('<a href="javascript:alert(1)">x</a>')).not.toContain('javascript:')
  })

  it('keeps images with src and alt', () => {
    const html = '<img src="https://cdn.example.com/a.png" alt="Screenshot" />'
    expect(sanitizeArticleHtml(html)).toContain('src="https://cdn.example.com/a.png"')
    expect(sanitizeArticleHtml(html)).toContain('alt="Screenshot"')
  })
})

describe('render-boundary defense for search headlines', () => {
  // htmlToText's output (body_text) is not guaranteed free of "<" — see the
  // comment on htmlToText. The XSS defense for its one HTML-rendered
  // consumer lives here instead: Postgres ts_headline wraps matches in
  // body_text with <mark> and does not escape the rest of the string, so
  // lib/search/search.ts re-sanitizes ts_headline's output down to
  // allowedTags: ['mark'] before it is ever rendered. This test documents
  // and locks in that guarantee.
  it('strips everything except <mark> from ts_headline-shaped input', () => {
    const headline = sanitizeHtml('<script>alert(1)</script> and <mark>hit</mark>', {
      allowedTags: ['mark'],
      allowedAttributes: {},
    })
    expect(headline).toBe(' and <mark>hit</mark>')
  })
})

describe('htmlToText', () => {
  it('returns readable text with words separated', () => {
    expect(htmlToText('<h2>Billing</h2><p>Cancel <em>anytime</em>.</p>')).toBe(
      'Billing Cancel anytime .',
    )
  })

  it('drops script contents', () => {
    expect(htmlToText('<p>Hi</p><script>secret</script>')).toBe('Hi')
  })

  it('returns an empty string for empty input', () => {
    expect(htmlToText('')).toBe('')
  })

  it('never lets an unclosed tag survive as markup', () => {
    const result = htmlToText('<p>hi<img src=x onerror=alert(1)')
    expect(result).not.toContain('<')
    expect(result).not.toContain('onerror')
  })

  it('preserves prose that merely contains angle brackets', () => {
    expect(htmlToText('a < b and c > d')).toBe('a < b and c > d')
  })

  it('decodes named entities', () => {
    expect(htmlToText('<p>Tom &amp; Jerry said &quot;hi&quot;</p>')).toBe(
      'Tom & Jerry said "hi"',
    )
  })

  it('decodes an escaped angle bracket back to prose', () => {
    expect(htmlToText('<p>5 &lt; 10</p>')).toBe('5 < 10')
  })

  it('decodes numeric entities into inert text, not markup', () => {
    const result = htmlToText('&#106;avascript:alert(1)')
    expect(result).toBe('javascript:alert(1)')
    expect(result).not.toContain('<')
  })

  it('strips a nested/malformed script attempt entirely', () => {
    const result = htmlToText('<scr<script>ipt>alert(1)</script>')
    expect(result).not.toContain('<')
    expect(result.toLowerCase()).not.toContain('script')
  })

  // SECURITY: decoding entities more than once is a bug, not an improvement.
  // Double-encoded input like "&amp;lt;script&amp;gt;" must decode to the
  // single-decoded literal text "&lt;script&gt;" — what a reader actually
  // typed — and go no further. A second decode pass would turn that inert
  // text into live-looking "<script>" markup. Do not add one.
  it('decodes double-encoded input exactly once, not into live markup', () => {
    expect(htmlToText('&amp;lt;script&amp;gt;')).toBe('&lt;script&gt;')
  })

  it('decodes a double-encoded ampersand exactly once', () => {
    expect(htmlToText('&amp;amp;')).toBe('&amp;')
  })

  it('decodes a double-encoded numeric reference exactly once', () => {
    expect(htmlToText('&amp;#60;')).toBe('&#60;')
  })
})
