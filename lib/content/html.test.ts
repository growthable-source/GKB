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
})
