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
 * Pro here (custom domain, team); a non-paid plan takes it away again,
 * so a comped unlock that gets cancelled on Xovera also loses Pro here
 * (nothing else reverts a comped unlock — it has no Stripe row).
 *
 * `billing` is passed whole because the install-specific `workspacePlan`
 * is the field to key on — `billing.plan` is the owner's BEST plan
 * across every workspace they own, which would leak Pro to a
 * help-centre owner who also owns an unrelated paid workspace.
 */
export async function syncProFromXoveraPlan(
  helpCenterId: string,
  billing: { plan?: string; workspacePlan?: string | null } | null | undefined,
): Promise<void> {
  const effectivePlan = billing?.workspacePlan ?? billing?.plan
  const shouldBePro = !!effectivePlan && PAID_XOVERA_PLANS.has(effectivePlan)
  const db = serviceClient()

  if (shouldBePro) {
    const { error } = await db.from('help_centers').update({ plan: 'pro' }).eq('id', helpCenterId).eq('plan', 'free')
    if (error) console.error(`Could not set plan=pro for ${helpCenterId}: ${error.message}`)
    return
  }

  // Not paid on Xovera → ensure Pro is OFF. Guarded to installs Xovera
  // actually knows about (a null/absent plan for an unknown install must
  // not strip Pro from a Stripe-billed GKB customer): callers only pass
  // billing for installs that resolved on Xovera.
  if (billing) {
    const { error } = await db.from('help_centers').update({ plan: 'free' }).eq('id', helpCenterId).eq('plan', 'pro')
    if (error) console.error(`Could not revert plan=free for ${helpCenterId}: ${error.message}`)
  }
}

/**
 * One-call sync for a single centre, covering both cases: no local
 * install row (recover it from Xovera) and an existing row whose plan
 * changed (refresh the Pro flag). This is what the unlock push from
 * Xovera and the admin "Sync" button call.
 */
export async function syncCenterWithXovera(
  helpCenterId: string,
): Promise<{ recovered: boolean; refreshed: boolean }> {
  const existing = await getInstallForCenter(helpCenterId)
  if (!existing) {
    const recovered = await reconcileInstallForCenter(helpCenterId)
    return { recovered, refreshed: recovered }
  }
  try {
    const remote = await getInstall(externalIdFor(helpCenterId))
    await syncProFromXoveraPlan(helpCenterId, remote.billing)
    return { recovered: false, refreshed: true }
  } catch (error) {
    if (!(error instanceof XoveraError && error.code === 'not_found')) {
      console.error(`Could not refresh Xovera state for ${helpCenterId}:`, error)
    }
    return { recovered: false, refreshed: false }
  }
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

  await syncProFromXoveraPlan(helpCenterId, remote.billing)

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
