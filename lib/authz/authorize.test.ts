import { describe, expect, it } from 'vitest'
import { can, type Actor } from './authorize'

const owner: Actor = { userId: 'u1', memberships: [{ helpCenterId: null, role: 'owner' }] }
const staff: Actor = { userId: 'u2', memberships: [{ helpCenterId: null, role: 'staff' }] }
const editor: Actor = { userId: 'u3', memberships: [{ helpCenterId: 'h1', role: 'editor' }] }
const contributor: Actor = {
  userId: 'u4',
  memberships: [{ helpCenterId: 'h1', role: 'contributor' }],
}
const anonymous: Actor = { userId: null, memberships: [] }

describe('can', () => {
  it('lets staff manage content anywhere', () => {
    expect(can(staff, 'article.publish', { helpCenterId: 'h2' })).toBe(true)
    expect(can(staff, 'collection.create', {})).toBe(true)
  })

  it('lets owners and staff delete help centers, but never scoped roles', () => {
    // Delete is an admin-area operation (the UI adds a typed-slug
    // confirmation on top). Customers ask support; editors can't nuke
    // their own centre.
    expect(can(owner, 'helpCenter.delete', { helpCenterId: 'h1' })).toBe(true)
    expect(can(staff, 'helpCenter.delete', { helpCenterId: 'h1' })).toBe(true)
    expect(can(editor, 'helpCenter.delete', { helpCenterId: 'h1' })).toBe(false)
    expect(can(contributor, 'helpCenter.delete', { helpCenterId: 'h1' })).toBe(false)
  })

  it('lets owners and staff create help centers but not editors or contributors', () => {
    expect(can(owner, 'helpCenter.create', {})).toBe(true)
    expect(can(staff, 'helpCenter.create', {})).toBe(true)
    expect(can(editor, 'helpCenter.create', { helpCenterId: 'h1' })).toBe(false)
    expect(can(contributor, 'helpCenter.create', { helpCenterId: 'h1' })).toBe(false)
  })

  it('scopes editors to their own help center', () => {
    expect(can(editor, 'article.publish', { helpCenterId: 'h1' })).toBe(true)
    expect(can(editor, 'article.publish', { helpCenterId: 'h2' })).toBe(false)
  })

  it('lets contributors write but never publish', () => {
    expect(can(contributor, 'article.create', { helpCenterId: 'h1' })).toBe(true)
    expect(can(contributor, 'article.publish', { helpCenterId: 'h1' })).toBe(false)
  })

  it('denies everything to anonymous actors', () => {
    expect(can(anonymous, 'article.create', { helpCenterId: 'h1' })).toBe(false)
    expect(can(anonymous, 'collection.create', {})).toBe(false)
  })
})
