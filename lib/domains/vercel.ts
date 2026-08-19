/**
 * Vercel Domains API — the infrastructure half of custom domains.
 *
 * A customer's hostname has to exist in two places before it serves
 * traffic: attached to our Vercel project (this file) and active in
 * custom_domains (lib/tenancy/active.ts resolves by it). The flow in
 * app/dashboard/domain/actions.ts writes both.
 *
 * Server-only, same rules as lib/ai-widget/client.ts: the token can
 * attach and detach domains on the whole project, so nothing here may
 * reach a client component. Unset env is a supported state —
 * isVercelDomainsConfigured() gates the feature off rather than
 * throwing (the repo-wide convention).
 *
 * Env: VERCEL_TOKEN (create at vercel.com/account/tokens),
 *      VERCEL_PROJECT_ID (the gkb project id),
 *      VERCEL_TEAM_ID (optional; required when the project lives in a
 *      team, which ours does).
 */

const API = 'https://api.vercel.com'

export function isVercelDomainsConfigured(): boolean {
  return Boolean(process.env.VERCEL_TOKEN && process.env.VERCEL_PROJECT_ID)
}

export class VercelDomainError extends Error {
  readonly status: number | null
  constructor(message: string, status: number | null = null) {
    super(message)
    this.name = 'VercelDomainError'
    this.status = status
  }
}

/** A DNS record the customer must create, straight from Vercel. */
export type DnsInstruction = {
  type: string
  name: string
  value: string
  reason: 'verification' | 'routing'
}

export type DomainStatus = {
  /** Vercel accepts the domain as belonging to this project. */
  verified: boolean
  /** DNS does not point at Vercel yet (only meaningful when verified). */
  misconfigured: boolean
  instructions: DnsInstruction[]
}

async function call<T>(method: string, path: string, body?: unknown): Promise<{ status: number; json: T }> {
  const token = process.env.VERCEL_TOKEN
  if (!token) throw new VercelDomainError('VERCEL_TOKEN is not set')

  const teamId = process.env.VERCEL_TEAM_ID
  const url = new URL(`${API}${path}`)
  if (teamId) url.searchParams.set('teamId', teamId)

  let response: Response
  try {
    response = await fetch(url, {
      method,
      headers: {
        authorization: `Bearer ${token}`,
        ...(body ? { 'content-type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(15_000),
      cache: 'no-store',
    })
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'request failed'
    throw new VercelDomainError(`Could not reach Vercel: ${detail}`)
  }

  const json = (await response.json().catch(() => ({}))) as T
  return { status: response.status, json }
}

/** Attaches the hostname to our project. Already-attached is success. */
export async function addDomainToVercel(hostname: string): Promise<void> {
  const projectId = process.env.VERCEL_PROJECT_ID
  const { status, json } = await call<{ error?: { code?: string; message?: string } }>(
    'POST',
    `/v10/projects/${projectId}/domains`,
    { name: hostname },
  )
  if (status < 300) return
  if (json.error?.code === 'domain_already_in_use' && /this project/i.test(json.error?.message ?? '')) return
  throw new VercelDomainError(json.error?.message ?? `Vercel returned ${status}`, status)
}

/** Detaches the hostname. Absent is success. */
export async function removeDomainFromVercel(hostname: string): Promise<void> {
  const projectId = process.env.VERCEL_PROJECT_ID
  const { status, json } = await call<{ error?: { message?: string } }>(
    'DELETE',
    `/v9/projects/${projectId}/domains/${encodeURIComponent(hostname)}`,
  )
  if (status < 300 || status === 404) return
  throw new VercelDomainError(json.error?.message ?? `Vercel returned ${status}`, status)
}

/**
 * Where the domain stands, plus the exact DNS records to show the
 * customer. Two Vercel calls because verification challenges and DNS
 * routing state live on different endpoints.
 */
export async function getDomainStatus(hostname: string): Promise<DomainStatus> {
  const projectId = process.env.VERCEL_PROJECT_ID

  const [domainRes, configRes] = await Promise.all([
    call<{
      verified?: boolean
      verification?: Array<{ type: string; domain: string; value: string }>
      error?: { message?: string }
    }>('GET', `/v9/projects/${projectId}/domains/${encodeURIComponent(hostname)}`),
    call<{ misconfigured?: boolean }>('GET', `/v6/domains/${encodeURIComponent(hostname)}/config`),
  ])

  if (domainRes.status >= 300) {
    throw new VercelDomainError(domainRes.json.error?.message ?? `Vercel returned ${domainRes.status}`, domainRes.status)
  }

  const instructions: DnsInstruction[] = []
  for (const v of domainRes.json.verification ?? []) {
    instructions.push({ type: v.type.toUpperCase(), name: v.domain, value: v.value, reason: 'verification' })
  }
  // Routing records: apex points A at Vercel's anycast IP, subdomains
  // CNAME at the shared edge alias. Only shown while DNS is wrong.
  if (configRes.json.misconfigured !== false) {
    const isApex = hostname.split('.').length === 2
    instructions.push(
      isApex
        ? { type: 'A', name: hostname, value: '76.76.21.21', reason: 'routing' }
        : { type: 'CNAME', name: hostname, value: 'cname.vercel-dns.com', reason: 'routing' },
    )
  }

  return {
    verified: domainRes.json.verified === true,
    misconfigured: configRes.json.misconfigured !== false,
    instructions,
  }
}
