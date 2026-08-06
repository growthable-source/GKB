'use client'

import { useState } from 'react'
import { EditorContent, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Link from '@tiptap/extension-link'
import Image from '@tiptap/extension-image'
import Placeholder from '@tiptap/extension-placeholder'

type Props = {
  articleId: string
  initialTitle: string
  initialBodyJson: Record<string, unknown> | null
  initialBodyHtml: string
  initialStatus: string
  initialCollectionId: string | null
  collections: { id: string; title: string }[]
  onSave: (input: {
    articleId: string
    title: string
    collectionId: string | null
    bodyJson: Record<string, unknown>
    bodyHtml: string
  }) => Promise<void>
  onPublish: (articleId: string) => Promise<void>
  onUnpublish: (articleId: string) => Promise<void>
  onDelete: (articleId: string) => Promise<void>
}

const TOOL =
  'cursor-pointer rounded px-2 py-1 text-sm text-neutral-700 hover:bg-neutral-100 disabled:opacity-40'

/**
 * The owner's article editor.
 *
 * Purpose-built rather than reusing the admin editor, which carries staff-only
 * controls (per-centre exclusions across every tenant) that an owner must never
 * see, and lacks the HTML source view.
 *
 * The source view is the point of the "paste your existing HTML" requirement:
 * rich paste into a WYSIWYG mangles anything it does not understand, so there
 * has to be a way to hand over markup verbatim. Whatever comes out of either
 * mode is sanitised server-side on save — this component never decides what is
 * safe.
 */
export function OwnerArticleEditor(props: Props) {
  const [title, setTitle] = useState(props.initialTitle)
  const [collectionId, setCollectionId] = useState(props.initialCollectionId ?? '')
  const [status, setStatus] = useState(props.initialStatus)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [sourceMode, setSourceMode] = useState(false)
  const [source, setSource] = useState(props.initialBodyHtml)
  const [uploading, setUploading] = useState(false)

  const editor = useEditor({
    // Next renders this on the server first; TipTap must not try to mount there.
    immediatelyRender: false,
    extensions: [
      StarterKit,
      Link.configure({ openOnClick: false }),
      Image,
      Placeholder.configure({ placeholder: 'Write the article, or paste it in…' }),
    ],
    content: props.initialBodyJson ?? props.initialBodyHtml ?? '',
    editorProps: {
      attributes: { class: 'prose prose-neutral max-w-none min-h-[24rem] focus:outline-none' },
    },
  })

  /** Source view is the authority while it is open, so its text wins on save. */
  function currentBody(): { bodyHtml: string; bodyJson: Record<string, unknown> } {
    if (sourceMode) return { bodyHtml: source, bodyJson: {} }
    return {
      bodyHtml: editor?.getHTML() ?? '',
      bodyJson: (editor?.getJSON() ?? {}) as Record<string, unknown>,
    }
  }

  async function save() {
    setSaving(true)
    setError(null)
    try {
      const body = currentBody()
      await props.onSave({
        articleId: props.articleId,
        title,
        collectionId: collectionId || null,
        ...body,
      })
      // Pull the sanitised result back into the editor so what is on screen is
      // what was stored, rather than what was typed.
      if (sourceMode) editor?.commands.setContent(body.bodyHtml)
      setSaved(new Date().toLocaleTimeString())
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Could not save.')
    } finally {
      setSaving(false)
    }
  }

  function toggleSource() {
    if (!sourceMode) {
      setSource(editor?.getHTML() ?? '')
      setSourceMode(true)
      return
    }
    editor?.commands.setContent(source)
    setSourceMode(false)
  }

  async function uploadImage(file: File) {
    setUploading(true)
    setError(null)
    const body = new FormData()
    body.append('file', file)
    const response = await fetch('/api/dashboard/uploads', { method: 'POST', body })
    const result = (await response.json()) as { url?: string; error?: string }
    if (result.url) editor?.chain().focus().setImage({ src: result.url }).run()
    else setError(result.error ?? 'Upload failed')
    setUploading(false)
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Article title"
          className="min-w-0 flex-1 rounded-md border border-neutral-300 px-3 py-2 text-lg font-medium"
        />
        <span
          className={`rounded-full px-2.5 py-1 text-xs ${
            status === 'published'
              ? 'bg-green-100 text-green-800'
              : 'bg-neutral-200 text-neutral-700'
          }`}
        >
          {status === 'published' ? 'Published' : 'Draft'}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <select
          value={collectionId}
          onChange={(event) => setCollectionId(event.target.value)}
          className="rounded-md border border-neutral-300 px-3 py-2 text-sm"
        >
          <option value="">No section</option>
          {props.collections.map((collection) => (
            <option key={collection.id} value={collection.id}>
              {collection.title}
            </option>
          ))}
        </select>
        <button type="button" onClick={toggleSource} className={TOOL}>
          {sourceMode ? 'Rich text' : 'HTML source'}
        </button>
      </div>

      {!sourceMode && editor && (
        <div className="flex flex-wrap items-center gap-1 rounded-md border border-neutral-200 bg-neutral-50 p-1.5">
          <button type="button" className={TOOL} onClick={() => editor.chain().focus().toggleBold().run()}>
            Bold
          </button>
          <button type="button" className={TOOL} onClick={() => editor.chain().focus().toggleItalic().run()}>
            Italic
          </button>
          <button
            type="button"
            className={TOOL}
            onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          >
            H2
          </button>
          <button
            type="button"
            className={TOOL}
            onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
          >
            H3
          </button>
          <button type="button" className={TOOL} onClick={() => editor.chain().focus().toggleBulletList().run()}>
            List
          </button>
          <button
            type="button"
            className={TOOL}
            onClick={() => {
              const url = window.prompt('Link URL')
              if (url) editor.chain().focus().setLink({ href: url }).run()
            }}
          >
            Link
          </button>
          <label className={`${TOOL} inline-block`}>
            {uploading ? 'Uploading…' : 'Image'}
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              disabled={uploading}
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0]
                if (file) void uploadImage(file)
                event.target.value = ''
              }}
            />
          </label>
        </div>
      )}

      {sourceMode ? (
        <textarea
          value={source}
          onChange={(event) => setSource(event.target.value)}
          spellCheck={false}
          className="min-h-[24rem] w-full rounded-md border border-neutral-300 p-3 font-mono text-sm"
        />
      ) : (
        <div className="rounded-md border border-neutral-300 p-4">
          <EditorContent editor={editor} />
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 border-t border-neutral-200 pt-4">
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="cursor-pointer rounded-md bg-neutral-900 px-4 py-2 text-sm text-white disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>

        {status === 'published' ? (
          <button
            type="button"
            onClick={async () => {
              await save()
              await props.onUnpublish(props.articleId)
              setStatus('draft')
            }}
            className="cursor-pointer rounded-md border border-neutral-300 px-4 py-2 text-sm"
          >
            Unpublish
          </button>
        ) : (
          <button
            type="button"
            onClick={async () => {
              await save()
              await props.onPublish(props.articleId)
              setStatus('published')
            }}
            className="cursor-pointer rounded-md bg-green-700 px-4 py-2 text-sm text-white"
          >
            Publish
          </button>
        )}

        <button
          type="button"
          onClick={async () => {
            if (window.confirm('Delete this article? This cannot be undone.')) {
              await props.onDelete(props.articleId)
            }
          }}
          className="cursor-pointer text-sm text-red-700 underline"
        >
          Delete
        </button>

        {saved && !error && <span className="text-sm text-neutral-500">Saved at {saved}</span>}
        {error && <span className="text-sm text-red-600">{error}</span>}
      </div>
    </div>
  )
}
