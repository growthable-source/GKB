import { NextResponse } from 'next/server'
import { serviceClient } from '@/lib/db/client'
import { authorize, ForbiddenError } from '@/lib/authz/authorize'
import { getActiveHelpCenter } from '@/lib/tenancy/active'

// SVG is deliberately absent: scripted SVG served inline from the public
// bucket would be stored XSS. The extension comes from this map, never from
// the client-supplied filename.
const ALLOWED_EXTENSIONS: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
}
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
  const extension = ALLOWED_EXTENSIONS[file.type]
  if (!extension) {
    return NextResponse.json({ error: `Unsupported type ${file.type}` }, { status: 400 })
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'File is larger than 10MB' }, { status: 400 })
  }

  const path = `${crypto.randomUUID()}.${extension}`

  const db = serviceClient()
  const { error } = await db.storage
    .from('article-media')
    .upload(path, file, { contentType: file.type, upsert: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const { data } = db.storage.from('article-media').getPublicUrl(path)
  return NextResponse.json({ url: data.publicUrl })
}
