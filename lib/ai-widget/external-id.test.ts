import { describe, expect, it } from 'vitest'
import { externalIdFor } from './external-id'

describe('externalIdFor', () => {
  it('is stable for a given help centre', () => {
    // The single most expensive bug available in this integration is an
    // externalId that varies per call: Xovera would provision a second
    // workspace and bill the customer for it.
    const id = '3f1c8a2e-0b7d-4a55-9c31-6de2f0a91b44'
    expect(externalIdFor(id)).toBe(externalIdFor(id))
  })

  it('namespaces us inside a keyspace shared with other partners', () => {
    expect(externalIdFor('abc')).toBe('hc_abc')
  })

  it('gives different centres different keys', () => {
    expect(externalIdFor('abc')).not.toBe(externalIdFor('abd'))
  })
})
