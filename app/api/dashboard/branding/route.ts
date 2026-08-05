import { NextResponse } from 'next/server'
import { authorize, ForbiddenError } from '@/lib/authz/authorize'
import { getOwnedCenter } from '@/lib/dashboard/owned-center'
import { uploadBrandingFile } from '@/lib/uploads/branding'

/**
 * Logo and favicon uploads from the customer dashboard.
 *
 * The staff route authorizes on `helpCenter.create`, which a customer does not
 * hold — they may update the one center they own and create nothing. Same
 * validation, different gate.
 */
export async function POST(request: Request) {
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

  const form = await request.formData()
  const result = await uploadBrandingFile(form.get('file'))

  if ('error' in result) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }
  return NextResponse.json({ url: result.url })
}
