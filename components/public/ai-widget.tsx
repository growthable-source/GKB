import { cachedInstallForCenter } from '@/lib/ai-widget/repository'

/**
 * The AI chat widget, on a help centre that has bought one.
 *
 * Rendered as a real script element from values validated at write time rather
 * than by injecting Xovera's HTML snippet: the snippet is a third-party string
 * and this renders on every page of every tenant's help centre, which is the
 * worst possible place for dangerouslySetInnerHTML. See lib/ai-widget/snippet.ts.
 *
 * React hoists `async` scripts to the head and dedupes them by src, so this
 * loads once per page even though the layout re-renders on navigation.
 *
 * The live/paused toggle in Xovera's builder is deliberately not mirrored here.
 * Xovera's own script decides whether to draw anything, and mirroring the flag
 * would mean polling their API on public page renders to keep it accurate.
 */
export async function AiWidget({ helpCenterId }: { helpCenterId: string }) {
  const install = await cachedInstallForCenter(helpCenterId)

  if (!install || install.status !== 'ready') return null
  if (!install.scriptSrc || !install.widgetId || !install.widgetPublicKey) return null

  return (
    <script
      src={install.scriptSrc}
      data-widget-id={install.widgetId}
      data-public-key={install.widgetPublicKey}
      async
    />
  )
}
