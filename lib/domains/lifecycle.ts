import { serviceClient } from '@/lib/db/client'

export async function liveHostnameOwner(hostname: string): Promise<string | null> {
  const { data } = await serviceClient()
    .from('custom_domains')
    .select('help_center_id')
    .eq('hostname', hostname)
    .eq('status', 'active')
    .maybeSingle()
  return data?.help_center_id ?? null
}

/**
 * Only the live holder (or the sole in-flight verifying row) may detach
 * a hostname from the shared Vercel project. Pending never attached.
 * A failed loser must not yank the winner's hostname.
 */
export async function shouldDetachHostname(
  hostname: string,
  helpCenterId: string,
  status: string,
): Promise<boolean> {
  if (status === 'pending' || status === 'failed') return false
  const live = await liveHostnameOwner(hostname)
  return live === null || live === helpCenterId
}
