import { describe, expect, it } from 'vitest'
import { extractHeadings } from './toc'

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
