import { NextResponse } from 'next/server'
import { authorize, ForbiddenError } from '@/lib/authz/authorize'
import { getOwnedCenter } from '@/lib/dashboard/owned-center'
import { XoveraError, mintBuilderLink } from '@/lib/ai-widget/client'
import { externalIdFor } from '@/lib/ai-widget/external-id'

/**
 * A fresh, single-use builder URL for the caller's own help centre.
 *
 * POST, and behind auth, because it mints a credential: the token in that URL
 * signs the customer into their Xovera workspace. It takes no parameters on
 * purpose — the centre comes from the session, so nobody can ask for a link
 * into a workspace that is not theirs.
 *
 * The client calls this on every mount rather than caching the URL. The token
 * is single-use and lives 10 minutes, so a cached one fails on the second open
 * and on a plain page refresh.
 */
export async function POST() {
  const center = await getOwnedCenter()
  if (!center) return NextResponse.json({ error: 'Not allowed' }, { status: 403 })

  try {
    await authorize('helpCenter.update', { helpCenterId: center.id })
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return NextResponse.json({ error: 'Not allowed' }, { status: 403 })
    }
    throw error
  }

  try {
    const link = await mintBuilderLink(externalIdFor(center.id))
    return NextResponse.json(
      { builderUrl: link.builderUrl },
      // Belt and braces against a proxy or the browser holding on to a
      // single-use token.
      { headers: { 'cache-control': 'no-store' } },
    )
  } catch (error) {
    if (error instanceof XoveraError) {
      console.error(`Builder link failed (${error.code}) for ${center.id}:`, error.message)

      // not_ready is the one a customer can act on: provisioning is still
      // running, so waiting works. The rest are ours to fix.
      const message =
        error.code === 'not_ready'
          ? 'Your widget is still being set up. Give it a moment and refresh.'
          : error.code === 'disabled'
            ? 'Your widget has been removed. Add it again to customise it.'
            : 'We could not open the customiser right now. Please try again shortly.'

      return NextResponse.json({ error: message }, { status: 502 })
    }
    throw error
  }
}
