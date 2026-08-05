import { serviceClient } from '@/lib/db/client'

// SVG is deliberately absent: scripted SVG served inline from the public
// bucket would be stored XSS. The extension comes from this map, never from
// the client-supplied filename.
const ALLOWED_EXTENSIONS: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/x-icon': 'ico',
  'image/vnd.microsoft.icon': 'ico',
}

// Branding assets (logo, favicon) are small by nature — tighter than the
// 10MB article-image cap.
const MAX_BYTES = 2 * 1024 * 1024

export type UploadResult = { url: string } | { error: string; status: number }

/**
 * Validates and stores one branding image.
 *
 * Shared by the staff upload route and the signup one so the two cannot drift:
 * they differ only in who is allowed to call them, never in what they accept.
 */
export async function uploadBrandingFile(file: unknown): Promise<UploadResult> {
  if (!(file instanceof File)) return { error: 'No file provided', status: 400 }

  const extension = ALLOWED_EXTENSIONS[file.type]
  if (!extension) return { error: `Unsupported type ${file.type}`, status: 400 }
  if (file.size > MAX_BYTES) return { error: 'File is larger than 2MB', status: 400 }

  const path = `${crypto.randomUUID()}.${extension}`
  const db = serviceClient()

  const { error } = await db.storage
    .from('article-media')
    .upload(path, file, { contentType: file.type, upsert: false })
  if (error) return { error: error.message, status: 500 }

  const { data } = db.storage.from('article-media').getPublicUrl(path)
  return { url: data.publicUrl }
}
