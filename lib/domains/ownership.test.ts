import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  hostnameHasOwnershipTxt,
  newOwnershipToken,
  ownershipInstruction,
  ownershipTxtName,
  ownershipTxtValue,
} from './ownership'

const resolveTxt = vi.hoisted(() => vi.fn<(name: string) => Promise<string[][]>>())

vi.mock('node:dns', () => ({
  promises: { resolveTxt },
}))

afterEach(() => {
  resolveTxt.mockReset()
})

describe('ownership TXT shape', () => {
  it('puts the challenge on a sibling name so it does not collide with the CNAME', () => {
    expect(ownershipTxtName('help.acme.com')).toBe('_gkb-verify.help.acme.com')
    expect(ownershipTxtValue('abc')).toBe('gkb-verify=abc')
    expect(ownershipInstruction('help.acme.com', 'abc')).toEqual({
      type: 'TXT',
      name: '_gkb-verify.help.acme.com',
      value: 'gkb-verify=abc',
      reason: 'verification',
    })
  })

  it('issues an unguessable token', () => {
    const a = newOwnershipToken()
    const b = newOwnershipToken()
    expect(a).toMatch(/^[0-9a-f]{32}$/)
    expect(a).not.toBe(b)
  })
})

describe('hostnameHasOwnershipTxt', () => {
  it('is true when the exact issued value is present', async () => {
    resolveTxt.mockResolvedValue([['gkb-verify=deadbeef']])
    await expect(hostnameHasOwnershipTxt('help.acme.com', 'deadbeef')).resolves.toBe(true)
    expect(resolveTxt).toHaveBeenCalledWith('_gkb-verify.help.acme.com')
  })

  it('is false when the TXT is missing, times out, or is a different token', async () => {
    resolveTxt.mockRejectedValueOnce(Object.assign(new Error('ENOTFOUND'), { code: 'ENOTFOUND' }))
    await expect(hostnameHasOwnershipTxt('help.acme.com', 'deadbeef')).resolves.toBe(false)

    resolveTxt.mockResolvedValueOnce([['gkb-verify=someone-else']])
    await expect(hostnameHasOwnershipTxt('help.acme.com', 'deadbeef')).resolves.toBe(false)

    await expect(hostnameHasOwnershipTxt('help.acme.com', '')).resolves.toBe(false)
    expect(resolveTxt).toHaveBeenCalledTimes(2)
  })

  it('joins multi-string TXT chunks from one record', async () => {
    resolveTxt.mockResolvedValue([['gkb-verify=', 'deadbeef']])
    await expect(hostnameHasOwnershipTxt('help.acme.com', 'deadbeef')).resolves.toBe(true)
  })
})
