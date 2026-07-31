import { NextResponse } from 'next/server'
import { serviceClient } from '@/lib/db/client'
import { authorize, ForbiddenError } from '@/lib/authz/authorize'
import { getActiveHelpCenter } from '@/lib/tenancy/active'

const ALLOWED = ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml']
const MAX_BYTES = 10 * 1024 * 1024

export async function POST(request: Request) {
  try {
    const helpCenter = await getActiveHelpCenter()
    await authorize('article.update', { helpCenterId: helpCenter.id })
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return NextResponse.json({ error: 'Not allowed' }, { status: 403 })
    }
    throw error
  }

  const form = await request.formData()
  const file = form.get('file')

  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 })
  }
  if (!ALLOWED.includes(file.type)) {
    return NextResponse.json({ error: `Unsupported type ${file.type}` }, { status: 400 })
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'File is larger than 10MB' }, { status: 400 })
  }

  const extension = file.name.split('.').pop() ?? 'bin'
  const path = `${crypto.randomUUID()}.${extension}`

  const db = serviceClient()
  const { error } = await db.storage
    .from('article-media')
    .upload(path, file, { contentType: file.type, upsert: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const { data } = db.storage.from('article-media').getPublicUrl(path)
  return NextResponse.json({ url: data.publicUrl })
}
