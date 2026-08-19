import { serviceClient } from '@/lib/db/client'

/**
 * Who "owns" a centre.
 *
 * The schema has no owner role at centre scope (the memberships CHECK
 * constraint forbids it) — the founding customer is written as an
 * 'editor', and so is everyone they invite. That made every editor
 * indistinguishable from the founder, so an invited editor could evict
 * the paying founder and seize the centre.
 *
 * The founder is the EARLIEST membership for the centre (they were
 * created first, at claim time). We treat that user as the owner for
 * the operations only they should perform: managing the team and the
 * custom domain. Content editing stays open to every editor.
 */
export async function centreOwnerUserId(centerId: string): Promise<string | null> {
  const { data } = await serviceClient()
    .from('memberships')
    .select('user_id')
    .eq('help_center_id', centerId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  return data?.user_id ?? null
}

export async function isCentreOwner(centerId: string, userId: string | null): Promise<boolean> {
  if (!userId) return false
  return (await centreOwnerUserId(centerId)) === userId
}
