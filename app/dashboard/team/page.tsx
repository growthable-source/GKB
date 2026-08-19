import { redirect } from 'next/navigation'
import { serviceClient } from '@/lib/db/client'
import { currentActor } from '@/lib/authz/authorize'
import { getOwnedCenter } from '@/lib/dashboard/owned-center'
import { TeamManager } from '@/components/dashboard/team-manager'
import { inviteTeamMember, revokeInvite, removeTeamMember } from './actions'

export const metadata = { title: 'Team — Growthable' }
export const dynamic = 'force-dynamic'

/**
 * Team management (Pro). Free centres see what it does and how to get
 * it; Pro centres manage members and pending invites. Member emails
 * come from auth.users via the admin API — small N, no join available
 * through PostgREST.
 */
export default async function TeamPage() {
  const center = await getOwnedCenter()
  if (!center) redirect('/get/details')

  if (center.plan !== 'pro') {
    return (
      <div className="rounded-lg border border-neutral-200 bg-white p-6">
        <span className="rounded-full bg-neutral-900 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">Pro</span>
        <h1 className="mt-3 text-xl font-semibold">Invite your team</h1>
        <p className="mt-2 max-w-xl text-sm text-neutral-600">
          Give the people who actually answer your clients their own logins — editors can write and
          publish, contributors can draft. Team access is part of Pro, which comes with the AI chat
          widget upgrade or the Agency AI plan. Talk to us and we&rsquo;ll switch it on.
        </p>
      </div>
    )
  }

  const db = serviceClient()
  const actor = await currentActor()

  const [{ data: memberships }, { data: invites }] = await Promise.all([
    db.from('memberships').select('user_id, role').eq('help_center_id', center.id),
    db.from('invites').select('id, email, role, expires_at')
      .eq('help_center_id', center.id)
      .is('accepted_at', null)
      .order('created_at', { ascending: false }),
  ])

  const members = await Promise.all(
    (memberships ?? []).map(async (m) => {
      const { data } = await db.auth.admin.getUserById(m.user_id)
      return {
        userId: m.user_id,
        role: m.role,
        email: data?.user?.email ?? '(unknown)',
        isSelf: m.user_id === actor.userId,
      }
    }),
  )

  return (
    <TeamManager
      members={members}
      invites={(invites ?? []).map((i) => ({ id: i.id, email: i.email, role: i.role, expiresAt: i.expires_at }))}
      inviteAction={inviteTeamMember}
      revokeAction={revokeInvite}
      removeAction={removeTeamMember}
    />
  )
}
