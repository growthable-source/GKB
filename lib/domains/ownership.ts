/**
 * Custom-domain ownership proof.
 *
 * A pending row must not reserve a hostname on the shared Vercel project
 * or lock it globally. The caller proves they control the zone with a
 * TXT record we issued, and only then do we attach and (after routing
 * DNS) mark the row active. Active hostnames stay unique.
 */

import { randomBytes, timingSafeEqual } from 'node:crypto'
import { promises as dns } from 'node:dns'
import type { DnsInstruction } from './vercel'

const TOKEN_BYTES = 16
const LOOKUP_MS = 8_000

export function newOwnershipToken(): string {
  return randomBytes(TOKEN_BYTES).toString('hex')
}

export function ownershipTxtName(hostname: string): string {
  return `_gkb-verify.${hostname}`
}

export function ownershipTxtValue(token: string): string {
  return `gkb-verify=${token}`
}

export function ownershipInstruction(hostname: string, token: string): DnsInstruction {
  return {
    type: 'TXT',
    name: ownershipTxtName(hostname),
    value: ownershipTxtValue(token),
    reason: 'verification',
  }
}

function hasToken(values: string[], token: string): boolean {
  const expected = Buffer.from(ownershipTxtValue(token))
  for (const value of values) {
    const got = Buffer.from(value.trim())
    if (got.length === expected.length && timingSafeEqual(got, expected)) return true
  }
  return false
}

export async function hostnameHasOwnershipTxt(hostname: string, token: string): Promise<boolean> {
  if (!token) return false
  const name = ownershipTxtName(hostname)
  try {
    const records = await Promise.race([
      dns.resolveTxt(name),
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('dns_timeout')), LOOKUP_MS)
      }),
    ])
    return hasToken(
      records.map((chunks) => chunks.join('')),
      token,
    )
  } catch {
    return false
  }
}
