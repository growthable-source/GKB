import { serviceClient } from '@/lib/db/client'
import { getInstallForCenter } from './repository'
import { isXoveraConfigured, refreshKnowledge, XoveraError } from './client'

/**
 * Tell Xovera to re-crawl this centre's articles into the AI widget's
 * knowledge, so a publish/edit shows up in the widget within ~a minute
 * instead of waiting out its ~7-day auto-recrawl.
 *
 * Fire-and-forget with the same contract as deliverSignup: AWAIT it (a
 * serverless function can be torn down before a dangling promise
 * resolves) and it NEVER throws — a knowledge refresh must not break
 * saving an article. Skips silently when the centre has no ready AI
 * widget install.
 *
 * Debounced per-centre: editors save repeatedly, and each push spends
 * Xovera's shared 60-writes/10-min org-key budget. The debounce window
 * is deliberately short — content freshness matters — but long enough
 * to collapse a rapid save burst into one crawl.
 */
const DEBOUNCE_MS = 3 * 60 * 1000

export async function pushKnowledgeRefresh(helpCenterId: string): Promise<void> {
  if (!isXoveraConfigured()) return
  try {
    const install = await getInstallForCenter(helpCenterId)
    if (!install || install.status !== 'ready') return

    const db = serviceClient()
    const { data: row } = await db
      .from('ai_widget_installs')
      .select('knowledge_pushed_at')
      .eq('help_center_id', helpCenterId)
      .maybeSingle()
    const last = row?.knowledge_pushed_at ? new Date(row.knowledge_pushed_at).getTime() : 0
    if (Date.now() - last < DEBOUNCE_MS) return

    // Stamp BEFORE the call so two near-simultaneous saves don't both
    // fire — the second reads the fresh timestamp and debounces out.
    await db
      .from('ai_widget_installs')
      .update({ knowledge_pushed_at: new Date().toISOString() })
      .eq('help_center_id', helpCenterId)

    await refreshKnowledge(install.externalId)
  } catch (error) {
    const detail = error instanceof XoveraError ? `${error.code}: ${error.message}` : String(error)
    console.error(`Could not refresh AI widget knowledge for ${helpCenterId}: ${detail}`)
  }
}
