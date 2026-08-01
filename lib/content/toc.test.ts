import { describe, expect, it } from 'vitest'
import { addHeadingIds, extractHeadings } from './toc'

describe('extractHeadings', () => {
  it('returns h2 and h3 headings with slugged ids', () => {
    const html = '<h2>Getting started</h2><p>x</p><h3>Step one</h3><h2>Billing</h2>'
    expect(extractHeadings(html)).toEqual([
      { id: 'getting-started', text: 'Getting started', level: 2 },
      { id: 'step-one', text: 'Step one', level: 3 },
      { id: 'billing', text: 'Billing', level: 2 },
    ])
  })

  it('strips inline markup from heading text', () => {
    expect(extractHeadings('<h2>Cancel <em>now</em></h2>')).toEqual([
      { id: 'cancel-now', text: 'Cancel now', level: 2 },
    ])
  })

  it('deduplicates repeated heading ids', () => {
    const result = extractHeadings('<h2>Notes</h2><h2>Notes</h2>')
    expect(result.map((h) => h.id)).toEqual(['notes', 'notes-2'])
  })

  it('returns an empty array when there are no headings', () => {
    expect(extractHeadings('<p>Just text</p>')).toEqual([])
  })
})

describe('addHeadingIds', () => {
  it('assigns duplicate heading ids in document order', () => {
    const html = '<h2>Notes</h2><p>x</p><h2>Notes</h2>'
    expect(addHeadingIds(html, extractHeadings(html))).toBe(
      '<h2 id="notes">Notes</h2><p>x</p><h2 id="notes-2">Notes</h2>',
    )
  })

  it('skips empty headings without desyncing later ids', () => {
    const html = '<h2>Intro</h2><h2></h2><h2>Outro</h2>'
    expect(addHeadingIds(html, extractHeadings(html))).toBe(
      '<h2 id="intro">Intro</h2><h2></h2><h2 id="outro">Outro</h2>',
    )
  })

  it('preserves existing attributes alongside the injected id', () => {
    const html = '<h2 class="intro">Getting started</h2>'
    expect(addHeadingIds(html, extractHeadings(html))).toBe(
      '<h2 class="intro" id="getting-started">Getting started</h2>',
    )
  })

  it('returns html without headings unchanged', () => {
    expect(addHeadingIds('<p>Just text</p>', [])).toBe('<p>Just text</p>')
  })
})
