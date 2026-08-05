import { NextResponse } from 'next/server'
import { readSignupToken } from '@/lib/signup/session'
import { findSignupByToken } from '@/lib/signup/repository'
import { uploadBrandingFile } from '@/lib/uploads/branding'

/**
 * Logo and favicon uploads from inside the signup funnel.
 *
 * The staff route next door authorizes on a membership, which nobody has yet
 * at this point in the funnel. The gate here is the signup cookie: it means the
 * caller has a pending row, which in turn means they cleared the work-email
 * check. That is a weaker claim than a membership, so it is paired with the
 * same 2MB cap and MIME allowlist, and it stops accepting uploads the moment
 * the signup is claimed.
 */
export async function POST(request: Request) {
  const token = await readSignupToken()
  const signup = token ? await findSignupByToken(token) : null

  if (!signup || signup.claimed_at) {
    return NextResponse.json({ error: 'Start a signup first' }, { status: 403 })
  }

  const form = await request.formData()
  const result = await uploadBrandingFile(form.get('file'))

  if ('error' in result) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }
  return NextResponse.json({ url: result.url })
}
