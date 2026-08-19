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

import { getInstall, isXoveraConfigured, XoveraError } from './client'
import { externalIdFor } from './external-id'
import { scriptSrcFrom } from './snippet'
import { getInstallForCenter, markProvisioning, markReady } from './repository'

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
