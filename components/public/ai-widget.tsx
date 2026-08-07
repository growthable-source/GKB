import Script from 'next/script'
import { cachedInstallForCenter } from '@/lib/ai-widget/repository'

/**
 * The AI chat widget, on a help centre that has bought one.
 *
 * Built from values validated at write time rather than by injecting Xovera's
 * HTML snippet: the snippet is a third-party string and this renders on every
 * page of every tenant's help centre, which is the worst possible place for
 * dangerouslySetInnerHTML. See lib/ai-widget/snippet.ts.
 *
 * Loaded through next/script at afterInteractive, NOT as a bare <script async>.
 * A bare one is hoisted into <head> by React 19 and lives inside the tree React
 * reconciles, which gave a widget that drew itself but ignored input: it can
 * initialise before <body> is complete, and anything it injects into the
 * reconciled tree can be rendered over during hydration, leaving live-looking
 * markup with dead listeners. afterInteractive injects once hydration is done
 * and keeps the widget's DOM out of React's way — which is also the placement
 * Xovera documents for the snippet, at the end of the body.
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
    <Script
      // Keyed on the widget so a centre that removes and re-adds one does not
      // get the previous widget's script left in place by reuse.
      id={`xovera-widget-${install.widgetId}`}
      src={install.scriptSrc}
      data-widget-id={install.widgetId}
      data-public-key={install.widgetPublicKey}
      strategy="afterInteractive"
    />
  )
}
