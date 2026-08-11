import { updateTag } from 'next/cache'
import { AI_WIDGET_TAG } from '@/lib/cache/tags'
import { authorize } from '@/lib/authz/authorize'
import { requestOrigin } from '@/lib/signup/origin'
import type { OwnedCenter } from '@/lib/dashboard/owned-center'
import { XoveraError, cancelInstall, provisionInstall } from './client'
import { applyEntitlementIfAny } from '@/lib/agency-plan/entitlement'
import { externalIdFor } from './external-id'
import { scriptSrcFrom } from './snippet'
import { activeCustomDomain, helpCenterUrl } from './center-url'
import { markDisabled, markFailed, markProvisioning, markReady } from './repository'

/**
 * Turning the AI chat widget on for a help centre.
 *
 * The order matters. We claim the row first, then call Xovera, then record what
 * came back. A crash or timeout between those steps leaves a row that knows its
 * own external id, so the retry sends the same key and Xovera resumes the
 * half-finished provision instead of starting a second workspace.
 *
 * Never call this from a page render. It is a write against a rate-limited
 * third party (60 per 10 minutes across ALL our customers, not per customer),
 * and the brief is explicit that it is an explicit-user-action-only endpoint.
 */
export async function addWidget(
  center: OwnedCenter,
  ownerEmail: string,
): Promise<{ error?: string }> {
  await authorize('helpCenter.update', { helpCenterId: center.id })

  const externalId = externalIdFor(center.id)
  const [origin, customDomain] = await Promise.all([
    requestOrigin(),
    activeCustomDomain(center.id),
  ])

  await markProvisioning(center.id, externalId)

  try {
    const install = await provisionInstall({
      externalId,
      email: ownerEmail,
      businessName: center.name,
      helpCenterUrl: helpCenterUrl(origin, center.slug, customDomain),
      // Their branding is already here, so the builder opens on something that
      // looks like theirs rather than on Xovera's defaults.
      widget: { primaryColor: center.primaryHex, title: center.name },
      // Where Xovera's trial-ended email sends them to upgrade: our
      // dashboard, our checkout, our brand. Never a Xovera billing page.
      metadata: { upgradeUrl: `${origin.replace(/\/+$/, '')}/dashboard/ai-agent` },
    })

    const scriptSrc = scriptSrcFrom(install.embedSnippet)
    if (!scriptSrc) {
      // The workspace exists and is billable, so this is not a rollback — it is
      // "provisioned but we cannot embed it", which needs a person.
      await markFailed(center.id, 'Xovera returned an embed snippet we could not read')
      return { error: 'The widget was created but we could not read its embed code. We have been notified.' }
    }

    await markReady(center.id, {
      installId: install.installId,
      workspaceId: install.workspaceId,
      widgetId: install.widget.id,
      widgetPublicKey: install.widget.publicKey,
      scriptSrc,
      embedSnippet: install.embedSnippet,
      trialEndsAt: install.trialEndsAt,
    })

    // An Agency AI plan centre skips the widget's own trial: assert the paid
    // Xovera plan now, so the customer never sees a countdown or an upgrade
    // button for something their $197 subscription already covers.
    await applyEntitlementIfAny(center.id, ownerEmail)
  } catch (error) {
    const message = failureMessage(error)
    await markFailed(center.id, error instanceof Error ? error.message : String(error))
    return { error: message }
  } finally {
    // Runs on both paths: a failure still changed the stored status, and the
    // dashboard reads through the same tag.
    updateTag(AI_WIDGET_TAG)
  }

  return {}
}

/**
 * Turning it off.
 *
 * Xovera's DELETE deactivates rather than deletes, and so does ours — the row
 * stays, holding the external id, because re-enabling has to reach the same
 * workspace and the customer's conversation history lives there.
 */
export async function removeWidget(center: OwnedCenter): Promise<{ error?: string }> {
  await authorize('helpCenter.update', { helpCenterId: center.id })

  try {
    await cancelInstall(externalIdFor(center.id))
  } catch (error) {
    // A 404 means Xovera has no such install, which is the state we are trying
    // to reach. Anything else and we leave our row alone rather than claim a
    // removal that did not happen.
    if (!(error instanceof XoveraError) || error.code !== 'not_found') {
      return { error: failureMessage(error) }
    }
  }

  await markDisabled(center.id)
  updateTag(AI_WIDGET_TAG)
  return {}
}

/**
 * What to put in front of the customer.
 *
 * Xovera's own messages describe Xovera's internals, so the codes we can act on
 * get our words instead. Everything unmapped keeps a generic line and is logged
 * — a customer cannot do anything with "migration_pending".
 */
function failureMessage(error: unknown): string {
  if (!(error instanceof XoveraError)) {
    console.error('AI widget provisioning threw:', error)
    return 'Something went wrong setting up your widget. Please try again.'
  }

  console.error(`AI widget provisioning failed (${error.code}):`, error.message)

  switch (error.code) {
    case 'rate_limited':
      return 'We are setting up a lot of widgets right now. Try again in a few minutes.'
    case 'network':
      return 'That took too long. Your widget may still be being created — try again in a moment and we will pick up where it got to.'
    case 'bad_param':
      return 'We could not send your details to the widget service. Please get in touch.'
    default:
      // unauthorized / forbidden / not_configured / migration_pending are all
      // our problem, not theirs, and all need Ryan rather than a retry.
      return 'The widget service is not available right now. We have been notified.'
  }
}
