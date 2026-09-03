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
 * Env: VERCEL_TOKEN (create at vercel.com/account/tokens — mind the
 *        expiry; an expired token 403s on every call),
 *      VERCEL_PROJECT_ID (the gkb project id),
 *      VERCEL_TEAM_ID (the team owning the project). All three are
 *        required: the API resolves scope from teamId, so without it a
 *        perfectly good token still 403s "Not authorized" — which the
 *        customer reads as a problem with their DNS.
 */

const API = 'https://api.vercel.com'

export function isVercelDomainsConfigured(): boolean {
  return Boolean(
    process.env.VERCEL_TOKEN && process.env.VERCEL_PROJECT_ID && process.env.VERCEL_TEAM_ID,
  )
}

export class VercelDomainError extends Error {
  readonly status: number | null
  /**
   * 401/403 mean our token is expired, revoked, or scoped to the wrong
   * team — never something the customer can fix. Callers surface these
   * as "not configured on this environment" rather than leaking
   * Vercel's bare "Not authorized" into a customer-facing dashboard.
   */
  readonly isCredentialProblem: boolean
  constructor(message: string, status: number | null = null) {
    super(message)
    this.name = 'VercelDomainError'
    this.status = status
    this.isCredentialProblem = status === 401 || status === 403
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

/**
 * Triggers Vercel's own verification check for a domain that carried a
 * TXT challenge (hostname already associated with another Vercel
 * account/team — common when an agency moves an existing help.*
 * subdomain). Polling GET never performs verification; this POST does.
 * Best-effort: a 4xx just means "not satisfied yet", which the caller
 * re-reads via getDomainStatus.
 */
async function triggerVerification(hostname: string): Promise<void> {
  const projectId = process.env.VERCEL_PROJECT_ID
  await call('POST', `/v9/projects/${projectId}/domains/${encodeURIComponent(hostname)}/verify`).catch(() => {})
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

  type DomainJson = {
    verified?: boolean
    verification?: Array<{ type: string; domain: string; value: string }>
    error?: { message?: string }
  }
  type ConfigJson = { misconfigured?: boolean; recommendedIPv4?: string[]; recommendedCNAME?: string[] }

  const domainPath = `/v9/projects/${projectId}/domains/${encodeURIComponent(hostname)}`
  let domainRes = await call<DomainJson>('GET', domainPath)
  if (domainRes.status >= 300) {
    throw new VercelDomainError(domainRes.json.error?.message ?? `Vercel returned ${domainRes.status}`, domainRes.status)
  }

  // If there's an outstanding TXT challenge, ask Vercel to check it —
  // then re-read, so a customer who already created the record sees
  // 'verified' on this same click instead of being stuck forever.
  if (domainRes.json.verified !== true && (domainRes.json.verification ?? []).length > 0) {
    await triggerVerification(hostname)
    domainRes = await call<DomainJson>('GET', domainPath)
  }

  const configRes = await call<ConfigJson>('GET', `/v6/domains/${encodeURIComponent(hostname)}/config`)

  const instructions: DnsInstruction[] = []
  for (const v of domainRes.json.verification ?? []) {
    instructions.push({ type: v.type.toUpperCase(), name: v.domain, value: v.value, reason: 'verification' })
  }
  if (configRes.json.misconfigured !== false) {
    // Prefer Vercel's own recommended records; fall back to the known
    // defaults. Apex detection is public-suffix-aware so multi-label
    // registrable apexes (youragency.co.uk) aren't mis-told to CNAME
    // at the zone apex, which DNS providers reject.
    const recIPv4 = configRes.json.recommendedIPv4?.[0]
    const recCNAME = configRes.json.recommendedCNAME?.[0]
    if (isApexDomain(hostname)) {
      instructions.push({ type: 'A', name: hostname, value: recIPv4 ?? '76.76.21.21', reason: 'routing' })
    } else {
      instructions.push({ type: 'CNAME', name: hostname, value: recCNAME ?? 'cname.vercel-dns.com', reason: 'routing' })
    }
  }

  return {
    verified: domainRes.json.verified === true,
    misconfigured: configRes.json.misconfigured !== false,
    instructions,
  }
}

// Two-label public suffixes where the registrable domain is 3 labels
// (a CNAME cannot sit at the zone apex). Not exhaustive, but covers the
// common agency cases; anything else falls back to the label-count
// heuristic, which is correct for ordinary .com/.io/.net apexes.
const TWO_LABEL_SUFFIXES = new Set([
  'co.uk', 'org.uk', 'me.uk', 'ltd.uk', 'plc.uk',
  'com.au', 'net.au', 'org.au', 'co.nz', 'org.nz',
  'co.za', 'com.br', 'co.in', 'co.jp', 'com.mx', 'com.sg',
])

function isApexDomain(hostname: string): boolean {
  const parts = hostname.split('.')
  if (parts.length < 2) return true
  const lastTwo = parts.slice(-2).join('.')
  // e.g. youragency.co.uk → 3 labels, suffix 'co.uk' → apex.
  if (TWO_LABEL_SUFFIXES.has(lastTwo)) return parts.length === 3
  return parts.length === 2
}
