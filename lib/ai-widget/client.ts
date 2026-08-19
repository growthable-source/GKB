/**
 * Xovera partner provisioning API.
 *
 * One org-scope key covers every customer — there is no per-customer
 * credential — which is exactly why nothing in this file may ever reach a
 * browser. The key can create accounts and workspaces for arbitrary email
 * addresses, so every function here is server-only and every caller must have
 * already authorized the person on our side.
 *
 * NEVER import this module into a client component, the same rule that governs
 * lib/db/client.ts. XOVERA_API_KEY has no NEXT_PUBLIC_ prefix so Next will not
 * inline it into a bundle, but a client import would still drag this module
 * into one and silently leave every call unauthenticated.
 *
 * Contract: docs/api/v1-partner-provisioning.md in the ghl-agent repo.
 */

const DEFAULT_BASE_URL = 'https://app.xovera.io'

/**
 * Provisioning does five sequential writes on Xovera's side. The brief asks for
 * a 60s allowance; anything less turns a slow-but-succeeding provision into a
 * client-side error against a workspace that now exists.
 */
const PROVISION_TIMEOUT_MS = 60_000

/** Reads and link mints are single writes. A long hang here is a dead call. */
const DEFAULT_TIMEOUT_MS = 15_000

export type XoveraErrorCode =
  | 'unauthorized'
  | 'forbidden'
  | 'bad_param'
  | 'rate_limited'
  | 'not_configured'
  | 'migration_pending'
  | 'not_ready'
  | 'disabled'
  | 'not_found'
  | 'network'
  | 'unknown'

/**
 * A failure with Xovera's own error code attached.
 *
 * `retryable` encodes the brief's error table in one place so callers do not
 * each re-derive it: a 429 is worth retrying later, a 422 never is, and a
 * misconfigured key is an alert rather than a retry loop.
 */
export class XoveraError extends Error {
  readonly code: XoveraErrorCode
  readonly status: number | null
  readonly retryable: boolean

  constructor(code: XoveraErrorCode, message: string, status: number | null = null) {
    super(message)
    this.name = 'XoveraError'
    this.code = code
    this.status = status
    this.retryable = RETRYABLE.includes(code)
  }
}

/**
 * Worth trying again unchanged.
 *
 * `network` is in here because provisioning is idempotent on externalId — a
 * timed-out provision that actually succeeded returns the same workspace on the
 * retry rather than creating a second one. `not_ready` is in here because it
 * means "poll the status endpoint", which is a retry with waiting.
 */
const RETRYABLE: XoveraErrorCode[] = ['rate_limited', 'network', 'not_ready']

/** Maps an HTTP status plus Xovera's error code onto our union. */
function codeFor(status: number, body: string): XoveraErrorCode {
  const known: XoveraErrorCode[] = [
    'unauthorized', 'forbidden', 'bad_param', 'rate_limited',
    'not_configured', 'migration_pending', 'not_ready', 'disabled', 'not_found',
  ]

  // Xovera's error shape is always { error: { code, message } }. Two distinct
  // conditions share 503 and two share 409, so the body's code is the only
  // thing that separates them — the status alone cannot.
  const parsed = known.find((code) => body.includes(`"${code}"`))
  if (parsed) return parsed

  if (status === 401) return 'unauthorized'
  if (status === 403) return 'forbidden'
  if (status === 404) return 'not_found'
  if (status === 422) return 'bad_param'
  if (status === 429) return 'rate_limited'
  return 'unknown'
}

function messageFor(body: string, fallback: string): string {
  try {
    const parsed = JSON.parse(body) as { error?: { message?: string } }
    return parsed.error?.message ?? fallback
  } catch {
    return fallback
  }
}

export function isXoveraConfigured(): boolean {
  return Boolean(process.env.XOVERA_API_KEY)
}

function baseUrl(): string {
  return (process.env.XOVERA_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, '')
}

async function call<T>(
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  path: string,
  options: { body?: unknown; timeoutMs?: number } = {},
): Promise<T> {
  const key = process.env.XOVERA_API_KEY
  if (!key) throw new XoveraError('not_configured', 'XOVERA_API_KEY is not set')

  let response: Response
  try {
    response = await fetch(`${baseUrl()}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${key}`,
        ...(options.body ? { 'content-type': 'application/json' } : {}),
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: AbortSignal.timeout(options.timeoutMs ?? DEFAULT_TIMEOUT_MS),
      // This is a provisioning call against a live third party; a cached
      // response would be wrong in every case, including the GET.
      cache: 'no-store',
    })
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'request failed'
    throw new XoveraError('network', `Could not reach Xovera: ${detail}`)
  }

  const text = await response.text().catch(() => '')

  if (!response.ok) {
    throw new XoveraError(
      codeFor(response.status, text),
      messageFor(text, `Xovera returned ${response.status}`),
      response.status,
    )
  }

  try {
    return (JSON.parse(text) as { data: T }).data
  } catch {
    throw new XoveraError('unknown', 'Xovera returned a response we could not read')
  }
}

// --- Shapes -----------------------------------------------------------------

export type InstallStatus = 'provisioning' | 'ready' | 'failed' | 'disabled'

export type ProvisionRequest = {
  externalId: string
  /**
   * The real account owner's address. Xovera creates a passwordless account on
   * our say-so, on the strength of us having authenticated them — a placeholder
   * or a shared inbox here hands someone a workspace that is not theirs.
   */
  email: string
  businessName: string
  /** Seeds the widget's origin allowlist, so the embed cannot be lifted elsewhere. */
  helpCenterUrl: string
  widget?: {
    primaryColor?: string
    title?: string
    subtitle?: string
    welcomeMessage?: string
  }
  /** Free-form context stored on the install. upgradeUrl is read back by
   *  Xovera's trial-ended email so its CTA lands on OUR checkout page. */
  metadata?: { upgradeUrl?: string }
}

export type ProvisionResponse = {
  installId: string
  /** false when the call was an idempotent retry against an existing install. */
  created: boolean
  workspaceId: string
  widget: { id: string; publicKey: string }
  embedSnippet: string
  builderUrl: string
  trialEndsAt: string | null
}

export type InstallResponse = {
  status: InstallStatus
  failureReason: string | null
  /** Present once provisioning has run; used by reconciliation to rebuild a
   *  lost/never-written ai_widget_installs row from Xovera's state. */
  installId?: string
  workspaceId?: string | null
  /** publicKey arrives as a field on newer Xovera deployments; older ones only
   *  bake it into embedSnippet, so treat it as optional. */
  widget: { id: string; isActive: boolean; embedSnippet: string; publicKey?: string } | null
  /** The customer's Xovera client portal (CSAT, per-subaccount AI toggle,
   *  query analysis, weekly report email). Optional: older installs have
   *  one only after the next provision call backfills it. */
  portal?: { slug: string; url: string } | null
  billing: { plan: string; trialDaysRemaining: number; trialExpired: boolean } | null
  usage: {
    conversationCount: number
    aiHandledLast7Days?: number
    timeSavedMinutesLast7Days?: number
    csatAverage?: number | null
    csatCount?: number
  } | null
}

export type BuilderLinkResponse = { builderUrl: string; expiresInSeconds: number }
export type PortalLinkResponse = { portalUrl: string; expiresInSeconds: number }

export type RegisterRequest = {
  externalId: string
  /** Same trust rule as ProvisionRequest.email — the authenticated owner. */
  email: string
  businessName: string
  helpCenterUrl?: string
  metadata?: Record<string, unknown>
}

export type RegisterResponse = {
  installId: string
  /** 'registered' on first call; the current status on any later call. */
  status: string
}

// --- Calls ------------------------------------------------------------------

/**
 * Creates the install, or returns the existing one.
 *
 * Idempotent on externalId, which is what makes a retry after a timeout safe —
 * it resumes a half-finished provision rather than starting a second workspace.
 * Explicit user action only: never call this on a page render.
 */
export function provisionInstall(request: ProvisionRequest): Promise<ProvisionResponse> {
  return call<ProvisionResponse>('POST', '/api/v1/partner/installs', {
    body: request,
    timeoutMs: PROVISION_TIMEOUT_MS,
  })
}

/**
 * Makes a help centre KNOWN to Xovera without provisioning anything — no
 * account, no workspace, no trial clock, no emails on their side. Purely so
 * the centre appears on Xovera's admin Help Center page, where Growthable
 * staff can provision + unlock it later. Idempotent in every state, so it is
 * safe to fire from the signup funnel and from backfills alike.
 */
export function registerInstall(request: RegisterRequest): Promise<RegisterResponse> {
  return call<RegisterResponse>('POST', '/api/v1/partner/registrations', { body: request })
}

/**
 * A single-use, 10-minute builder URL.
 *
 * Mint one per open. Caching it means the second open — and a plain page
 * refresh — shows "this link is no longer valid".
 */
export function mintBuilderLink(externalId: string): Promise<BuilderLinkResponse> {
  return call<BuilderLinkResponse>(
    'POST',
    `/api/v1/partner/installs/${encodeURIComponent(externalId)}/builder-link`,
  )
}

/** Live status, billing, and usage. The read behind the trial nudge. */
export function getInstall(externalId: string): Promise<InstallResponse> {
  return call<InstallResponse>('GET', `/api/v1/partner/installs/${encodeURIComponent(externalId)}`)
}

/**
 * A fresh, single-use portal sign-in URL — the customer lands in their
 * portal already authenticated, no invite email or password required.
 * Same rules as the builder link: mint per click, never cache.
 */
export function mintPortalLink(externalId: string): Promise<PortalLinkResponse> {
  return call<PortalLinkResponse>(
    'POST',
    `/api/v1/partner/installs/${encodeURIComponent(externalId)}/portal-link`,
  )
}

/**
 * Deactivates the widget and marks the install disabled.
 *
 * Not a delete: the workspace, agent, and conversation history survive, so
 * re-enabling is a flag flip and support can still see what happened.
 */
export function cancelInstall(externalId: string): Promise<unknown> {
  return call<unknown>('DELETE', `/api/v1/partner/installs/${encodeURIComponent(externalId)}`)
}

/**
 * Asserts the customer's plan to Xovera after OUR checkout settles.
 * 'canceled' returns them to the lapsed-trial state: widget answering,
 * portal paused, nothing deleted.
 */
export function setPartnerPlan(externalId: string, plan: string): Promise<unknown> {
  return call<unknown>('PUT', `/api/v1/partner/installs/${encodeURIComponent(externalId)}/plan`, {
    body: { plan },
  })
}
