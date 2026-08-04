'use client'

import { EditorContent, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Link from '@tiptap/extension-link'
import Image from '@tiptap/extension-image'
import Placeholder from '@tiptap/extension-placeholder'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { EditorToolbar } from './editor-toolbar'
import { CenterVisibility, type SelectableCenter } from './center-visibility'

type Props = {
  articleId: string
  initialTitle: string
  initialBodyJson: Record<string, unknown> | null
  collections: { id: string; title: string }[]
  initialCollectionId: string | null
  /** Excludable centers — the base center is not among them. */
  centers: SelectableCenter[]
  initialExcludedCenterIds: string[]
  onSave: (input: {
    articleId: string
    title: string
    collectionId: string | null
    bodyJson: Record<string, unknown>
    bodyHtml: string
  }) => Promise<void>
  onPublish: (articleId: string) => Promise<void>
  onSetExclusions: (articleId: string, excludedHelpCenterIds: string[]) => Promise<void>
  onDelete: (articleId: string) => Promise<void>
}

export function ArticleEditor({
  articleId,
  initialTitle,
  initialBodyJson,
  collections,
  initialCollectionId,
  centers,
  initialExcludedCenterIds,
  onSave,
  onPublish,
  onSetExclusions,
  onDelete,
}: Props) {
  const [title, setTitle] = useState(initialTitle)
  const [collectionId, setCollectionId] = useState(initialCollectionId ?? '')
  const [excludedCenterIds, setExcludedCenterIds] = useState(initialExcludedCenterIds)
  const [status, setStatus] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const router = useRouter()

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      // The article title is a separate field, so the body starts at h2.
      StarterKit.configure({ heading: { levels: [2, 3, 4] } }),
      Link.configure({ openOnClick: false }),
      Image,
      Placeholder.configure({ placeholder: 'Write the article…' }),
    ],
    content: initialBodyJson ?? '',
    editorProps: {
      attributes: { class: 'prose max-w-none min-h-80 focus:outline-none' },
    },
  })

  function save(then?: () => Promise<void>) {
    if (!editor) return
    setStatus(null)
    startTransition(async () => {
      try {
        await onSave({
          articleId,
          title,
          collectionId: collectionId || null,
          bodyJson: editor.getJSON() as Record<string, unknown>,
          bodyHtml: editor.getHTML(),
        })
        // Visibility saves with the article rather than on every checkbox click,
        // so ticking several centers is one write and can be abandoned.
        await onSetExclusions(articleId, excludedCenterIds)
        if (then) await then()
        setStatus('Saved')
      } catch (error) {
        setStatus(error instanceof Error ? error.message : 'Save failed')
      }
    })
  }

  function remove() {
    if (!window.confirm(`Delete “${title}”? This cannot be undone.`)) return
    setStatus(null)
    startTransition(async () => {
      try {
        await onDelete(articleId)
        router.push('/admin/articles')
      } catch (error) {
        setStatus(error instanceof Error ? error.message : 'Delete failed')
      }
    })
  }

  async function insertImage(file: File) {
    setStatus('Uploading image…')
    const body = new FormData()
    body.append('file', file)

    const response = await fetch('/api/uploads', { method: 'POST', body })
    const result = (await response.json()) as { url?: string; error?: string }

    if (!response.ok || !result.url) {
      setStatus(result.error ?? 'Upload failed')
      return
    }

    editor?.chain().focus().setImage({ src: result.url }).run()
    setStatus(null)
  }

  return (
    <div className="flex flex-col gap-4">
      <input
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        placeholder="Article title"
        className="w-full border-0 border-b border-neutral-200 pb-2 text-2xl font-semibold focus:outline-none"
      />

      <select
        value={collectionId}
        onChange={(event) => setCollectionId(event.target.value)}
        className="w-fit rounded-md border border-neutral-300 px-3 py-2 text-sm"
      >
        <option value="">No collection</option>
        {collections.map((collection) => (
          <option key={collection.id} value={collection.id}>
            {collection.title}
          </option>
        ))}
      </select>

      <label className="w-fit cursor-pointer rounded-md border border-neutral-300 px-3 py-2 text-sm">
        Insert image
        <input
          type="file"
          accept="image/png,image/jpeg,image/gif,image/webp"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0]
            if (file) void insertImage(file)
            event.target.value = ''
          }}
        />
      </label>

      <div>
        <EditorToolbar editor={editor} />
        <div className="rounded-b-lg border border-neutral-200 bg-white p-6">
          <EditorContent editor={editor} />
        </div>
      </div>

      <CenterVisibility
        centers={centers}
        excludedIds={excludedCenterIds}
        onChange={setExcludedCenterIds}
      />

      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={() => save()}
          disabled={pending}
          className="rounded-md border border-neutral-300 px-4 py-2 text-sm disabled:opacity-50"
        >
          Save draft
        </button>
        <button
          onClick={() => save(() => onPublish(articleId))}
          disabled={pending}
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm text-white disabled:opacity-50"
        >
          Save and publish
        </button>
        {status && <span className="text-sm text-neutral-500">{status}</span>}

        <button
          onClick={remove}
          disabled={pending}
          className="ml-auto rounded-md border border-red-200 px-4 py-2 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50"
        >
          Delete
        </button>
      </div>
    </div>
  )
}
