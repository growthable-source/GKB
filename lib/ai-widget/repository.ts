import { unstable_cache } from 'next/cache'
import { serviceClient } from '@/lib/db/client'
import { AI_WIDGET_TAG, AI_WIDGET_TTL_SECONDS } from '@/lib/cache/tags'
import type { InstallStatus } from './client'

/**
 * Our half of a Xovera install.
 *
 * Everything here is recoverable from Xovera — provisioning is idempotent on
 * externalId, so the row is a cache that saves the public page render a
 * third-party round trip, not a source of truth. Treat a missing row as "not
 * provisioned" and a stale one as "ask Xovera".
 */
export type WidgetInstall = {
  helpCenterId: string
  externalId: string
  installId: string | null
  workspaceId: string | null
  widgetId: string | null
  widgetPublicKey: string | null
  scriptSrc: string | null
  status: InstallStatus
  failureReason: string | null
  trialEndsAt: string | null
}

const FIELDS =
  'help_center_id, external_id, install_id, workspace_id, widget_id, widget_public_key, script_src, status, failure_reason, trial_ends_at'

type Row = {
  help_center_id: string
  external_id: string
  install_id: string | null
  workspace_id: string | null
  widget_id: string | null
  widget_public_key: string | null
  script_src: string | null
  status: string
  failure_reason: string | null
  trial_ends_at: string | null
}

const VALID_STATUSES: InstallStatus[] = ['provisioning', 'ready', 'failed', 'disabled']

/**
 * Narrows the raw status column. Degrades to 'failed' rather than throwing: an
 * unreadable status renders on public pages, and a status we do not recognise
 * must not be treated as 'ready' by omission.
 */
function parseStatus(value: string): InstallStatus {
  return (VALID_STATUSES as string[]).includes(value) ? (value as InstallStatus) : 'failed'
}

function toInstall(row: Row): WidgetInstall {
  return {
    helpCenterId: row.help_center_id,
    externalId: row.external_id,
    installId: row.install_id,
    workspaceId: row.workspace_id,
    widgetId: row.widget_id,
    widgetPublicKey: row.widget_public_key,
    scriptSrc: row.script_src,
    status: parseStatus(row.status),
    failureReason: row.failure_reason,
    trialEndsAt: row.trial_ends_at,
  }
}

async function findByCenter(helpCenterId: string): Promise<WidgetInstall | null> {
  const { data, error } = await serviceClient()
    .from('ai_widget_installs')
    .select(FIELDS)
    .eq('help_center_id', helpCenterId)
    .maybeSingle()

  if (error) throw new Error(`Could not read the AI widget install: ${error.message}`)
  return data ? toInstall(data as Row) : null
}

/** Uncached read. Use from the dashboard, where the customer's own write must be visible. */
export const getInstallForCenter = findByCenter

/**
 * Cross-request cached read for public pages.
 *
 * Every public page view would otherwise pay a query to discover that the
 * overwhelming majority of centres have no widget at all. Busted explicitly by
 * add and remove; the short TTL covers only changes made outside this app.
 */
export const cachedInstallForCenter = unstable_cache(findByCenter, ['ai-widget-install'], {
  tags: [AI_WIDGET_TAG],
  revalidate: AI_WIDGET_TTL_SECONDS,
})

/**
 * Claims the install row for a centre before we call Xovera.
 *
 * Written first, and with the external id, so a provision that times out
 * mid-flight leaves a row saying so instead of nothing at all — the retry then
 * has the same key to send, which is what makes Xovera's idempotency work for
 * us rather than just in principle.
 */
export async function markProvisioning(helpCenterId: string, externalId: string): Promise<void> {
  const { error } = await serviceClient()
    .from('ai_widget_installs')
    .upsert(
      {
        help_center_id: helpCenterId,
        external_id: externalId,
        status: 'provisioning',
        failure_reason: null,
      },
      { onConflict: 'help_center_id' },
    )

  if (error) throw new Error(`Could not start the AI widget install: ${error.message}`)
}

export type ReadyInstall = {
  installId: string
  workspaceId: string
  widgetId: string
  widgetPublicKey: string
  scriptSrc: string
  embedSnippet: string
  trialEndsAt: string | null
}

export async function markReady(helpCenterId: string, install: ReadyInstall): Promise<void> {
  const { error } = await serviceClient()
    .from('ai_widget_installs')
    .update({
      install_id: install.installId,
      workspace_id: install.workspaceId,
      widget_id: install.widgetId,
      widget_public_key: install.widgetPublicKey,
      script_src: install.scriptSrc,
      embed_snippet: install.embedSnippet,
      trial_ends_at: install.trialEndsAt,
      status: 'ready',
      failure_reason: null,
    })
    .eq('help_center_id', helpCenterId)

  if (error) throw new Error(`Could not save the AI widget install: ${error.message}`)
}

/** Records why provisioning did not finish, so the dashboard can say and offer a retry. */
export async function markFailed(helpCenterId: string, reason: string): Promise<void> {
  const { error } = await serviceClient()
    .from('ai_widget_installs')
    .update({ status: 'failed', failure_reason: reason.slice(0, 500) })
    .eq('help_center_id', helpCenterId)

  if (error) console.error(`Could not record AI widget failure for ${helpCenterId}: ${error.message}`)
}

/**
 * Stops the widget being injected.
 *
 * The row survives, carrying the external id, because Xovera's DELETE is also
 * not a delete — re-enabling has to reach the same workspace.
 */
export async function markDisabled(helpCenterId: string): Promise<void> {
  const { error } = await serviceClient()
    .from('ai_widget_installs')
    .update({ status: 'disabled' })
    .eq('help_center_id', helpCenterId)

  if (error) throw new Error(`Could not remove the AI widget: ${error.message}`)
}
