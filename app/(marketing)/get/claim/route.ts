import { redirect } from 'next/navigation'
import { userClient } from '@/lib/db/client'
import { claimSignup } from '@/lib/signup/claim'

/**
 * The last step: a verified session becomes a live help center.
 *
 * Reached from /auth/confirm once the magic link has been exchanged for a
 * session. Everything the claim needs is either in that session (the proven
 * email) or in the pending row (everything else), so this route takes no
 * parameters — which also means a forwarded or re-clicked link cannot be
 * pointed at somebody else's signup.
 */
export async function GET() {
  const { data } = await (await userClient()).auth.getUser()
  const email = data.user?.email

  if (!data.user || !email) redirect('/login?next=/get/claim')

  const outcome = await claimSignup(data.user.id, email)

  if (outcome.kind === 'no-signup') redirect('/get/details')

  if (outcome.kind === 'claimed' && outcome.notice) {
    redirect(`/dashboard?notice=${encodeURIComponent(outcome.notice)}`)
  }

  redirect('/dashboard')
}
