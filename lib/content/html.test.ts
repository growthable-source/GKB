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

  it('never leaks a "<" character for a table of hostile inputs', () => {
    const hostileInputs = [
      '<p>hi<img src=x onerror=alert(1)',
      '<scr<script>ipt>alert(1)</script>',
      '<a href="javascript:alert(1)">click</a>',
      '<svg onload=alert(1)>x</svg>',
      '<<script>script>alert(1)<</script>/script>',
      '<div><p>unterminated',
    ]

    for (const input of hostileInputs) {
      expect(htmlToText(input)).not.toContain('<')
    }
  })
})
