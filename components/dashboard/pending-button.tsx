'use client'

import { useFormStatus } from 'react-dom'

/**
 * A submit button that says what it is doing while its form's server action
 * runs, and cannot be clicked twice. Without it a slow action looks like a
 * click that did nothing, and people click again or refresh.
 */
export function PendingButton({
  children,
  pendingLabel,
  className,
}: {
  children: React.ReactNode
  pendingLabel: string
  className?: string
}) {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className={`${className ?? ''} ${pending ? 'cursor-wait opacity-60' : 'cursor-pointer'}`}
    >
      {pending ? pendingLabel : children}
    </button>
  )
}
