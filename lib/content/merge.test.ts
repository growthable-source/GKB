import { describe, expect, it } from 'vitest'
import { mergeArticle, mergeCollection } from './merge'
import type {
  ArticlePlacement,
  CanonicalArticle,
  CanonicalCollection,
  CollectionPlacement,
} from './types'

const canonical: CanonicalArticle = {
  id: 'a1',
  slug: 'cancel-subscription',
  title: 'Cancel your subscription',
  excerpt: 'How to cancel.',
  bodyJson: { type: 'doc', content: [] },
  bodyHtml: '<p>Canonical body</p>',
  collectionId: 'c1',
  status: 'published',
  publishedAt: '2026-07-01T00:00:00Z',
}

const placement: ArticlePlacement = {
  helpCenterId: 'h1',
  articleId: 'a1',
  position: 3,
  isHidden: false,
  titleOverride: null,
  bodyJsonOverride: null,
  bodyHtmlOverride: null,
  collectionOverrideId: null,
}

describe('mergeArticle title', () => {
  it('inherits the canonical title when no placement exists', () => {
    const result = mergeArticle(canonical, null)
    expect(result.title).toBe('Cancel your subscription')
    expect(result.isOverridden).toBe(false)
  })

  it('inherits the canonical title when the override is null', () => {
    expect(mergeArticle(canonical, placement).title).toBe('Cancel your subscription')
  })

  it('uses the override when one is set', () => {
    const result = mergeArticle(canonical, { ...placement, titleOverride: 'Stop billing' })
    expect(result.title).toBe('Stop billing')
    expect(result.isOverridden).toBe(true)
  })

  it('treats an empty or whitespace-only override as inherit', () => {
    expect(mergeArticle(canonical, { ...placement, titleOverride: '' }).title).toBe(
      'Cancel your subscription',
    )
    expect(mergeArticle(canonical, { ...placement, titleOverride: '   ' }).title).toBe(
      'Cancel your subscription',
    )
    expect(mergeArticle(canonical, { ...placement, titleOverride: '  ' }).isOverridden).toBe(
      false,
    )
  })

  it('does not count a title override that matches the canonical value', () => {
    const result = mergeArticle(canonical, {
      ...placement,
      titleOverride: 'Cancel your subscription',
    })
    expect(result.title).toBe('Cancel your subscription')
    expect(result.isOverridden).toBe(false)
  })
})

describe('mergeArticle body', () => {
  it('inherits the canonical body when no override is set', () => {
    const result = mergeArticle(canonical, placement)
    expect(result.bodyHtml).toBe('<p>Canonical body</p>')
  })

  it('replaces both body fields together when html is overridden', () => {
    const overrideJson = { type: 'doc', content: [{ type: 'paragraph' }] }
    const result = mergeArticle(canonical, {
      ...placement,
      bodyHtmlOverride: '<p>Local body</p>',
      bodyJsonOverride: overrideJson,
    })
    expect(result.bodyHtml).toBe('<p>Local body</p>')
    expect(result.bodyJson).toEqual(overrideJson)
    expect(result.isOverridden).toBe(true)
  })

  it('keeps the canonical json when only html is overridden', () => {
    const result = mergeArticle(canonical, {
      ...placement,
      bodyHtmlOverride: '<p>Local body</p>',
    })
    expect(result.bodyHtml).toBe('<p>Local body</p>')
    expect(result.bodyJson).toEqual(canonical.bodyJson)
  })

  it('ignores a json override with no html override, because html is what renders', () => {
    const result = mergeArticle(canonical, {
      ...placement,
      bodyJsonOverride: { type: 'doc', content: [{ type: 'paragraph' }] },
    })
    expect(result.bodyHtml).toBe('<p>Canonical body</p>')
    expect(result.bodyJson).toEqual(canonical.bodyJson)
    expect(result.isOverridden).toBe(false)
  })
})

describe('mergeArticle collection', () => {
  it('inherits the canonical collection', () => {
    expect(mergeArticle(canonical, placement).collectionId).toBe('c1')
  })

  it('files the article under the override collection when set', () => {
    const result = mergeArticle(canonical, { ...placement, collectionOverrideId: 'c2' })
    expect(result.collectionId).toBe('c2')
    expect(result.isOverridden).toBe(true)
  })

  it('does not count a collection override that matches the canonical value', () => {
    const result = mergeArticle(canonical, { ...placement, collectionOverrideId: 'c1' })
    expect(result.collectionId).toBe('c1')
    expect(result.isOverridden).toBe(false)
  })
})

describe('mergeArticle placement flags', () => {
  it('carries position and hidden through', () => {
    const result = mergeArticle(canonical, { ...placement, position: 7, isHidden: true })
    expect(result.position).toBe(7)
    expect(result.isHidden).toBe(true)
  })

  it('defaults position to 0 and hidden to false without a placement', () => {
    const result = mergeArticle(canonical, null)
    expect(result.position).toBe(0)
    expect(result.isHidden).toBe(false)
  })
})

const canonicalCollection: CanonicalCollection = {
  id: 'c1',
  slug: 'billing',
  title: 'Billing',
  description: 'Invoices and payments.',
  icon: 'credit-card',
}

const collectionPlacement: CollectionPlacement = {
  helpCenterId: 'h1',
  collectionId: 'c1',
  position: 2,
  isHidden: false,
  titleOverride: null,
  descriptionOverride: null,
  audience: 'public',
}

describe('mergeCollection', () => {
  it('inherits canonical fields when nothing is overridden', () => {
    const result = mergeCollection(canonicalCollection, collectionPlacement)
    expect(result.title).toBe('Billing')
    expect(result.description).toBe('Invoices and payments.')
    expect(result.position).toBe(2)
    expect(result.audience).toBe('public')
    expect(result.isOverridden).toBe(false)
  })

  it('applies title and description overrides', () => {
    const result = mergeCollection(canonicalCollection, {
      ...collectionPlacement,
      titleOverride: 'Payments',
      descriptionOverride: 'Cards and receipts.',
    })
    expect(result.title).toBe('Payments')
    expect(result.description).toBe('Cards and receipts.')
    expect(result.isOverridden).toBe(true)
  })

  it('carries hidden and authenticated audience through', () => {
    const result = mergeCollection(canonicalCollection, {
      ...collectionPlacement,
      isHidden: true,
      audience: 'authenticated',
    })
    expect(result.isHidden).toBe(true)
    expect(result.audience).toBe('authenticated')
  })

  it('defaults audience to authenticated to fail closed without a placement', () => {
    const result = mergeCollection(canonicalCollection, null)
    expect(result.audience).toBe('authenticated')
  })
})
