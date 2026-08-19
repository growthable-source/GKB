/**
 * Pulls an install Xovera knows about into our ai_widget_installs cache.
 *
 * Normally that cache is written by addWidget() when the customer clicks
 * "Add AI chat widget" — but Growthable staff can now provision + unlock
 * an install from Xovera's admin side, and when that happens we have no
 * local row, so the widget would never render on the centre. This asks
 * Xovera whether an install exists for the centre's externalId and, if
 * it is ready, writes the row the public layout reads (the 30s
 * AI_WIDGET_TAG cache picks it up on its own).
 *
 * Never throws: a reconciliation failure leaves things exactly as they
 * were — no row, widget hidden — which is the state the caller already
 * handles. Returns true when a row was recovered.
 */

import { serviceClient } from '@/lib/db/client'
import { getInstall, isXoveraConfigured, XoveraError } from './client'
import { externalIdFor } from './external-id'
import { scriptSrcFrom } from './snippet'
import { getInstallForCenter, markProvisioning, markReady } from './repository'

const PAID_XOVERA_PLANS = new Set(['starter', 'growth', 'scale'])

/**
 * Xovera's plan is the entitlement source of truth once staff can
 * unlock installs from their admin side. A paid plan there lights up
 * Pro here (custom domain, team) — the same flag the $197 Agency AI
 * purchase sets via lib/agency-plan/entitlement.ts.
 */
export async function syncProFromXoveraPlan(helpCenterId: string, plan: string | null | undefined): Promise<void> {
  if (!plan || !PAID_XOVERA_PLANS.has(plan)) return
  const { error } = await serviceClient()
    .from('help_centers')
    .update({ plan: 'pro' })
    .eq('id', helpCenterId)
    .eq('plan', 'free')
  if (error) console.error(`Could not set plan=pro for ${helpCenterId}: ${error.message}`)
}

export async function reconcileInstallForCenter(helpCenterId: string): Promise<boolean> {
  if (!isXoveraConfigured()) return false

  const existing = await getInstallForCenter(helpCenterId)
  if (existing) return false

  const externalId = externalIdFor(helpCenterId)
  let remote
  try {
    remote = await getInstall(externalId)
  } catch (error) {
    if (error instanceof XoveraError && error.code === 'not_found') return false
    console.error(`Could not reconcile AI widget install for ${helpCenterId}:`, error)
    return false
  }

  // A 'registered' row on Xovera's side has no widget yet; anything not
  // ready has nothing renderable to cache. Wait for the unlock.
  if (remote.status !== 'ready' || !remote.widget?.embedSnippet) return false

  await syncProFromXoveraPlan(helpCenterId, remote.billing?.plan)

  // publicKey is a first-class field on newer Xovera deployments; fall
  // back to pulling it out of the snippet for older ones.
  const publicKey = remote.widget.publicKey
    ?? /data-public-key="([^"]+)"/.exec(remote.widget.embedSnippet)?.[1]
  const scriptSrc = scriptSrcFrom(remote.widget.embedSnippet)
  if (!publicKey || !scriptSrc) {
    console.error(`Xovera install for ${helpCenterId} is ready but the snippet is unusable`)
    return false
  }

  try {
    await markProvisioning(helpCenterId, externalId)
    await markReady(helpCenterId, {
      installId: remote.installId ?? '',
      workspaceId: remote.workspaceId ?? '',
      widgetId: remote.widget.id,
      widgetPublicKey: publicKey,
      scriptSrc,
      embedSnippet: remote.widget.embedSnippet,
      // GET carries days-remaining, not the raw timestamp. Null is safe:
      // entitlement is enforced on Xovera's side, and the dashboard reads
      // live billing state for the countdown anyway.
      trialEndsAt: null,
    })
  } catch (error) {
    console.error(`Could not store the reconciled install for ${helpCenterId}:`, error)
    return false
  }

  return true
}
