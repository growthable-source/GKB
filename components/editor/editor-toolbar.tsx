'use client'

import { useEffect, useState } from 'react'
import type { Editor } from '@tiptap/react'

/**
 * Formatting controls for the article editor.
 *
 * Every command here maps to an extension already configured in
 * article-editor.tsx, so this adds no new marks or nodes — and therefore needs
 * no change to sanitizeArticleHtml, which decides what survives a save.
 */
type Props = { editor: Editor | null }

function Button({
  onClick,
  active,
  disabled,
  label,
  children,
}: {
  onClick: () => void
  active?: boolean
  disabled?: boolean
  label: string
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onMouseDown={(event) => {
        // Keep the selection: the editor loses focus on mousedown otherwise, and
        // a command with no selection applies to nothing.
        event.preventDefault()
        onClick()
      }}
      disabled={disabled}
      aria-label={label}
      aria-pressed={active}
      title={label}
      className={`min-w-8 rounded px-2 py-1 text-sm leading-6 disabled:opacity-30 ${
        active ? 'bg-neutral-900 text-white' : 'text-neutral-700 hover:bg-neutral-200'
      }`}
    >
      {children}
    </button>
  )
}

function Divider() {
  return <span aria-hidden="true" className="mx-1 w-px self-stretch bg-neutral-300" />
}

export function EditorToolbar({ editor }: Props) {
  // Active states (is the cursor in bold text? in a list?) live in the editor,
  // not in React, so nothing would re-render this on a selection change. The
  // subscription must be in an effect with cleanup — registering it during
  // render would add a listener on every pass and never remove one.
  const [, bumpVersion] = useState(0)

  useEffect(() => {
    if (!editor) return
    const rerender = () => bumpVersion((version) => version + 1)
    editor.on('transaction', rerender)
    return () => {
      editor.off('transaction', rerender)
    }
  }, [editor])

  if (!editor) return null

  function setLink() {
    if (!editor) return
    const previous = editor.getAttributes('link').href as string | undefined
    const url = window.prompt('Link URL', previous ?? 'https://')

    // Cancel leaves the document untouched; clearing the field removes the link.
    if (url === null) return
    if (url === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run()
      return
    }

    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run()
  }

  return (
    <div className="flex flex-wrap items-stretch gap-1 rounded-t-lg border border-b-0 border-neutral-200 bg-neutral-50 p-2">
      <Button
        label="Bold"
        active={editor.isActive('bold')}
        onClick={() => editor.chain().focus().toggleBold().run()}
      >
        <strong>B</strong>
      </Button>
      <Button
        label="Italic"
        active={editor.isActive('italic')}
        onClick={() => editor.chain().focus().toggleItalic().run()}
      >
        <em>I</em>
      </Button>
      <Button
        label="Inline code"
        active={editor.isActive('code')}
        onClick={() => editor.chain().focus().toggleCode().run()}
      >
        <code>{'<>'}</code>
      </Button>

      <Divider />

      {/* The article title is a separate field, so the body starts at h2. */}
      {([2, 3, 4] as const).map((level) => (
        <Button
          key={level}
          label={`Heading ${level}`}
          active={editor.isActive('heading', { level })}
          onClick={() => editor.chain().focus().toggleHeading({ level }).run()}
        >
          H{level - 1}
        </Button>
      ))}

      <Divider />

      <Button
        label="Bullet list"
        active={editor.isActive('bulletList')}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
      >
        •
      </Button>
      <Button
        label="Numbered list"
        active={editor.isActive('orderedList')}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
      >
        1.
      </Button>
      <Button
        label="Quote"
        active={editor.isActive('blockquote')}
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
      >
        &rdquo;
      </Button>
      <Button
        label="Code block"
        active={editor.isActive('codeBlock')}
        onClick={() => editor.chain().focus().toggleCodeBlock().run()}
      >
        {'{}'}
      </Button>

      <Divider />

      <Button label="Link" active={editor.isActive('link')} onClick={setLink}>
        🔗
      </Button>

      <Divider />

      <Button
        label="Undo"
        disabled={!editor.can().undo()}
        onClick={() => editor.chain().focus().undo().run()}
      >
        ↶
      </Button>
      <Button
        label="Redo"
        disabled={!editor.can().redo()}
        onClick={() => editor.chain().focus().redo().run()}
      >
        ↷
      </Button>
    </div>
  )
}
