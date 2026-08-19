'use server'

import { createHash, randomBytes } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { serviceClient } from '@/lib/db/client'
import { authorize, currentActor } from '@/lib/authz/authorize'
import { getOwnedCenter } from '@/lib/dashboard/owned-center'
import { canSendEmail, sendEmail } from '@/lib/email/resend'
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

/** The signed-in customer's centre, verified Pro — or an error string. */
async function requireProCenter(): Promise<{ center: { id: string; name: string; plan: string } } | { error: string }> {
  const center = await getOwnedCenter()
  if (!center) return { error: 'No help centre on this account.' }
  if (center.plan !== 'pro') return { error: 'Team members are a Pro feature.' }
  await authorize('helpCenter.update', { helpCenterId: center.id })
  return { center }
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

  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'
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

  const actor = await currentActor()
  // Removing yourself would orphan the centre behind /get/details.
  if (userId === actor.userId) return { error: 'You cannot remove yourself.' }

  const { error } = await serviceClient().from('memberships').delete()
    .eq('user_id', userId)
    .eq('help_center_id', gate.center.id)
  if (error) return { error: `Could not remove the member: ${error.message}` }

  revalidatePath('/dashboard/team')
  return { ok: 'Member removed.' }
}
