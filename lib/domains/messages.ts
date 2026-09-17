/**
 * How a Vercel domain failure is told to the customer — and to us.
 *
 * Lives in lib/ rather than beside the server actions for two reasons:
 * a 'use server' module may only export async functions, and the domain
 * page needs the same wording as the actions do (it fetches the DNS
 * records at render time and has to explain it when that fails).
 */

import { VercelDomainError } from './vercel'

export type DomainVerb = 'attach' | 'check' | 'detach'

/**
 * Vercel's own wording is right for things the customer can act on (a
 * hostname another account already claimed). Credential failures are
 * ours — telling someone staring at their DNS panel "Not authorized"
 * sends them hunting for a problem that isn't theirs.
 */
export function domainErrorMessage(err: unknown, verb: DomainVerb): string {
  if (err instanceof VercelDomainError && err.isCredentialProblem) {
    return 'Custom domains are not set up correctly on this environment — our hosting credentials were rejected. Nothing to fix on your side; please contact support.'
  }
  const detail = err instanceof VercelDomainError ? err.message : String(err)
  return `Could not ${verb} the domain: ${detail}`
}

/**
 * Log first, then phrase. Every failure used to be mapped straight to
 * customer prose and the original thrown away, so a month of rejected
 * credentials produced no signal anywhere — we found out from a support
 * screenshot. The raw status and message go to the server log; the
 * return value is what the customer sees.
 */
export function reportDomainFailure(err: unknown, verb: DomainVerb, hostname: string): string {
  const status = err instanceof VercelDomainError ? err.status : null
  console.error(`[domains] ${verb} failed for ${hostname}`, {
    status,
    message: err instanceof Error ? err.message : String(err),
  })
  return domainErrorMessage(err, verb)
}
