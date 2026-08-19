import { createHash } from 'node:crypto'
import { redirect } from 'next/navigation'
import { serviceClient } from '@/lib/db/client'
import { ensureUser } from '@/lib/signup/send-link'

/**
 * Accepts a team invite.
 *
 * The invite arrived by email, so opening this link IS the proof of
 * inbox ownership — the same trust the login magic link rests on. The
 * flow: validate the (hashed) token, make sure an auth user exists,
 * insert the membership, mark the invite accepted, then hand the
 * browser to /auth/confirm with a fresh magic-link token so the person
 * lands in the dashboard already signed in.
 *
 * Failure never dead-ends: every reject path lands on /login with a
 * message, from where a valid member can sign in normally anyway.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const db = serviceClient()

  const { data: invite } = await db
    .from('invites')
    .select('id, email, help_center_id, role, expires_at, accepted_at')
    .eq('token', createHash('sha256').update(token).digest('hex'))
    .maybeSingle()

  if (!invite || !invite.help_center_id) {
    redirect('/login?error=' + encodeURIComponent('That invite link is not valid.'))
  }
  if (invite.accepted_at) {
    // Already a member — the magic link below would be nice, but a
    // consumed invite must not keep minting sign-ins forever.
    redirect('/login?error=' + encodeURIComponent('That invite was already used — sign in with your email.'))
  }
  if (new Date(invite.expires_at) < new Date()) {
    redirect('/login?error=' + encodeURIComponent('That invite expired — ask for a new one.'))
  }

  await ensureUser(invite.email)

  // generateLink also returns the user, which sidesteps needing a
  // lookup-by-email admin API for the membership row.
  const { data, error } = await db.auth.admin.generateLink({ type: 'magiclink', email: invite.email })
  if (error || !data?.user || !data.properties?.hashed_token) {
    redirect('/login?error=' + encodeURIComponent('We could not sign you in — try the link again.'))
  }

  const { error: membershipError } = await db.from('memberships').insert({
    user_id: data.user.id,
    help_center_id: invite.help_center_id,
    role: invite.role === 'contributor' ? 'contributor' : 'editor',
  })
  // A duplicate membership (clicked twice mid-flight) is fine; anything
  // else is not.
  if (membershipError && !/duplicate|unique/i.test(membershipError.message)) {
    redirect('/login?error=' + encodeURIComponent(`Could not add you to the team: ${membershipError.message}`))
  }

  await db.from('invites').update({ accepted_at: new Date().toISOString() }).eq('id', invite.id)

  redirect(
    `/auth/confirm?token_hash=${encodeURIComponent(data.properties.hashed_token)}&type=magiclink&next=${encodeURIComponent('/dashboard')}`,
  )
}
