import { redirect } from 'next/navigation'
import { serviceClient } from '@/lib/db/client'
import { getOwnedCenter } from '@/lib/dashboard/owned-center'
import { getDomainStatus, isVercelDomainsConfigured, type DnsInstruction } from '@/lib/domains/vercel'
import { ownershipInstruction } from '@/lib/domains/ownership'
import { reportDomainFailure } from '@/lib/domains/messages'
import { DomainManager } from '@/components/dashboard/domain-manager'
import { addCustomDomain, checkCustomDomain, removeCustomDomain } from './actions'

export const metadata = { title: 'Domain — Growthable' }
export const dynamic = 'force-dynamic'

/**
 * Custom domain (Pro). Free centres see the pitch; Pro centres add a
 * hostname, prove ownership with a TXT record, then get the routing
 * DNS records from Vercel and check until it flips live.
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
    .select('hostname, status, verified_at, ownership_token')
    .eq('help_center_id', center.id)
    .maybeSingle()

  // Pending: only the ownership TXT we issued — the hostname is not on
  // Vercel yet. Verifying: that TXT plus Vercel's routing records.
  // A Vercel blip must not render "create these records" above an empty
  // table.
  let instructions: DnsInstruction[] = []
  let instructionsError: string | null = null
  if (row && row.status !== 'active' && row.ownership_token) {
    instructions.push(ownershipInstruction(row.hostname, row.ownership_token))
  }
  if (row && row.status === 'verifying' && isVercelDomainsConfigured()) {
    try {
      instructions = [...instructions, ...(await getDomainStatus(row.hostname)).instructions]
    } catch (err) {
      instructionsError = reportDomainFailure(err, 'check', row.hostname)
    }
  }

  return (
    <DomainManager
      configured={isVercelDomainsConfigured()}
      domain={row ? { hostname: row.hostname, status: row.status, verifiedAt: row.verified_at } : null}
      instructions={instructions}
      instructionsError={instructionsError}
      addAction={addCustomDomain}
      checkAction={checkCustomDomain}
      removeAction={removeCustomDomain}
    />
  )
}
