'use server'

import { createHash, randomBytes } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { serviceClient } from '@/lib/db/client'
import { authorize, currentActor } from '@/lib/authz/authorize'
import { getOwnedCenter } from '@/lib/dashboard/owned-center'
import { centreOwnerUserId } from '@/lib/dashboard/centre-owner'
import { canSendEmail, sendEmail } from '@/lib/email/resend'
import { authLinkOrigin } from '@/lib/auth/link-origin'
import { teamInviteHtml, teamInviteSubject, teamInviteText } from '@/lib/email/team-invite-email'

/**
 * Team management — a Pro feature.
 *
 * Invites ride the invites table that shipped in the initial schema and
 * sat unused since: a hashed single-use token, 7-day expiry, accepted
 * via /invite/{token} which signs the person in through the same
 * generateLink flow the funnel uses. Only the sha256 of the token is
 * stored — a database read never yields a working invite link.
 */

const INVITE_TTL_DAYS = 7
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export type TeamActionState = { error?: string; ok?: string }

/**
 * The signed-in customer's centre, verified Pro AND owned by them —
 * team management is the OWNER's power, not every editor's. Without the
 * ownership gate an invited editor could invite/remove/revoke, up to
 * and including evicting the founder.
 */
async function requireProCenter(): Promise<{ center: { id: string; name: string; plan: string }; ownerId: string } | { error: string }> {
  const center = await getOwnedCenter()
  if (!center) return { error: 'No help centre on this account.' }
  if (center.plan !== 'pro') return { error: 'Team members are a Pro feature.' }
  await authorize('helpCenter.update', { helpCenterId: center.id })
  const actor = await currentActor()
  const ownerId = await centreOwnerUserId(center.id)
  if (!ownerId || ownerId !== actor.userId) {
    return { error: 'Only the help centre owner can manage the team.' }
  }
  return { center, ownerId }
}

export async function inviteTeamMember(
  _prev: TeamActionState | null,
  formData: FormData,
): Promise<TeamActionState> {
  const gate = await requireProCenter()
  if ('error' in gate) return { error: gate.error }
  const { center } = gate

  const email = String(formData.get('email') ?? '').trim().toLowerCase()
  const role = String(formData.get('role') ?? 'editor')
  if (!EMAIL_RE.test(email)) return { error: 'Enter a valid email address.' }
  if (!['editor', 'contributor'].includes(role)) return { error: 'Role must be editor or contributor.' }
  if (!canSendEmail()) return { error: 'Email sending is not configured on this environment.' }

  const db = serviceClient()

  // A user may own or help run exactly ONE centre (getOwnedCenter and
  // the claim flow both assume it). Inviting someone who already has a
  // centre-scoped membership would give them two, making their whole
  // dashboard nondeterministic — reject it rather than create the mess.
  const { data: invitedUsers } = await db.auth.admin.listUsers({ page: 1, perPage: 1000 })
  const invitedUserId = invitedUsers?.users.find((u) => u.email?.toLowerCase() === email)?.id
  if (invitedUserId) {
    const { data: theirMembership } = await db
      .from('memberships')
      .select('help_center_id')
      .eq('user_id', invitedUserId)
      .not('help_center_id', 'is', null)
      .maybeSingle()
    if (theirMembership && theirMembership.help_center_id !== center.id) {
      return { error: 'That person already belongs to another help centre and cannot join a second.' }
    }
    if (theirMembership) return { error: 'That person is already a member of this help centre.' }
  }

  // Re-inviting an address replaces the pending invite (fresh token +
  // clock) instead of stacking duplicates.
  await db.from('invites').delete()
    .eq('help_center_id', center.id)
    .eq('email', email)
    .is('accepted_at', null)

  const actor = await currentActor()
  const raw = randomBytes(24).toString('base64url')
  const { error } = await db.from('invites').insert({
    email,
    help_center_id: center.id,
    role,
    token: createHash('sha256').update(raw).digest('hex'),
    invited_by: actor.userId,
    expires_at: new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString(),
  })
  if (error) return { error: `Could not create the invite: ${error.message}` }

  const origin = await authLinkOrigin()
  const input = { centerName: center.name, role, inviteUrl: `${origin}/invite/${raw}` }
  try {
    await sendEmail({
      to: email,
      subject: teamInviteSubject(center.name),
      html: teamInviteHtml(input),
      text: teamInviteText(input),
    })
  } catch (sendError) {
    // The invite row without its email is a dead end — take it back out
    // so a retry starts clean.
    await db.from('invites').delete().eq('help_center_id', center.id).eq('email', email).is('accepted_at', null)
    const detail = sendError instanceof Error ? sendError.message : 'unknown error'
    console.error(`Team invite email failed for ${email}: ${detail}`)
    return { error: 'We could not send the invite email. Try again in a moment.' }
  }

  revalidatePath('/dashboard/team')
  return { ok: `Invite sent to ${email}.` }
}

export async function revokeInvite(
  _prev: TeamActionState | null,
  formData: FormData,
): Promise<TeamActionState> {
  const gate = await requireProCenter()
  if ('error' in gate) return { error: gate.error }

  const id = String(formData.get('inviteId') ?? '')
  if (!id) return { error: 'Missing invite id.' }

  const { error } = await serviceClient().from('invites').delete()
    .eq('id', id)
    .eq('help_center_id', gate.center.id)
    .is('accepted_at', null)
  if (error) return { error: `Could not revoke the invite: ${error.message}` }

  revalidatePath('/dashboard/team')
  return { ok: 'Invite revoked.' }
}

export async function removeTeamMember(
  _prev: TeamActionState | null,
  formData: FormData,
): Promise<TeamActionState> {
  const gate = await requireProCenter()
  if ('error' in gate) return { error: gate.error }

  const userId = String(formData.get('userId') ?? '')
  if (!userId) return { error: 'Missing user id.' }

  // Only the owner reaches here (requireProCenter), but never let even
  // the owner delete the owner membership — that's the founder, and
  // removing it orphans the centre behind /get/details with staff-only
  // recovery.
  if (userId === gate.ownerId) return { error: 'The help centre owner cannot be removed.' }

  const { error } = await serviceClient().from('memberships').delete()
    .eq('user_id', userId)
    .eq('help_center_id', gate.center.id)
  if (error) return { error: `Could not remove the member: ${error.message}` }

  revalidatePath('/dashboard/team')
  return { ok: 'Member removed.' }
}
