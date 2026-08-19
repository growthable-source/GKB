import { redirect } from 'next/navigation'
import { serviceClient } from '@/lib/db/client'
import { getOwnedCenter } from '@/lib/dashboard/owned-center'
import { getDomainStatus, isVercelDomainsConfigured, type DnsInstruction } from '@/lib/domains/vercel'
import { DomainManager } from '@/components/dashboard/domain-manager'
import { addCustomDomain, checkCustomDomain, removeCustomDomain } from './actions'

export const metadata = { title: 'Domain — Growthable' }
export const dynamic = 'force-dynamic'

/**
 * Custom domain (Pro). Free centres see the pitch; Pro centres add a
 * hostname, get the exact DNS records to create, and check status
 * until it flips live. The DNS instructions come from Vercel at render
 * time so they are always the truth, not a copy of it.
 */
export default async function DomainPage() {
  const center = await getOwnedCenter()
  if (!center) redirect('/get/details')

  if (center.plan !== 'pro') {
    return (
      <div className="rounded-lg border border-neutral-200 bg-white p-6">
        <span className="rounded-full bg-neutral-900 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">Pro</span>
        <h1 className="mt-3 text-xl font-semibold">Your own domain</h1>
        <p className="mt-2 max-w-xl text-sm text-neutral-600">
          Serve your help centre from help.youragency.com instead of a Growthable address. Custom
          domains are part of Pro, which comes with the AI chat widget upgrade or the Agency AI
          plan. Talk to us and we&rsquo;ll switch it on.
        </p>
      </div>
    )
  }

  const { data: row } = await serviceClient()
    .from('custom_domains')
    .select('hostname, status, verified_at')
    .eq('help_center_id', center.id)
    .maybeSingle()

  // Live DNS truth for a not-yet-active domain, best-effort — a Vercel
  // blip should degrade to "press Check", not error the page.
  let instructions: DnsInstruction[] = []
  if (row && row.status !== 'active' && isVercelDomainsConfigured()) {
    try {
      instructions = (await getDomainStatus(row.hostname)).instructions
    } catch {
      /* the Check button surfaces errors interactively */
    }
  }

  return (
    <DomainManager
      configured={isVercelDomainsConfigured()}
      domain={row ? { hostname: row.hostname, status: row.status, verifiedAt: row.verified_at } : null}
      instructions={instructions}
      addAction={addCustomDomain}
      checkAction={checkCustomDomain}
      removeAction={removeCustomDomain}
    />
  )
}
