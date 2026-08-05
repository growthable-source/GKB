'use client'

import { useActionState, useState } from 'react'
import { isWorkEmail } from '@/lib/signup/work-email'
import type { FunnelState } from '@/app/(marketing)/get/actions'

const FIELD =
  'w-full rounded-lg border border-[color:var(--mk-rule-strong)] bg-[color:var(--mk-surface)] px-3.5 py-3 text-[color:var(--mk-ink)] placeholder:text-[color:var(--mk-ink-faint)] focus:outline-2 focus:outline-offset-1 focus:outline-[color:var(--mk-accent)]'

export function DetailsForm({
  action,
  initialEmail,
}: {
  action: (prev: FunnelState | null, formData: FormData) => Promise<FunnelState>
  initialEmail: string
}) {
  const [state, formAction, pending] = useActionState(action, null)
  const [email, setEmail] = useState(initialEmail)
  const [touched, setTouched] = useState(false)

  // A hint, not the gate. checkWorkEmail on the server is what actually decides;
  // this only saves a round trip for the obvious cases.
  const hint = touched && email.trim() && !isWorkEmail(email)

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1.5">
        <span className="text-sm text-[color:var(--mk-ink-soft)]">Your name</span>
        <input name="fullName" required autoComplete="name" placeholder="Alex Reid" className={FIELD} />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm text-[color:var(--mk-ink-soft)]">Work email</span>
        <input
          name="email"
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          onBlur={() => setTouched(true)}
          placeholder="you@youragency.com"
          className={FIELD}
        />
      </label>

      {hint && (
        <p className="text-sm text-[color:var(--mk-accent)]">
          That looks like a personal address. Use the domain your agency trades under.
        </p>
      )}
      {state?.error && <p className="text-sm text-[color:var(--mk-accent)]">{state.error}</p>}

      <button
        type="submit"
        disabled={pending}
        className="mt-1 w-fit cursor-pointer rounded-lg bg-[color:var(--mk-accent)] px-5 py-3 font-medium text-[color:var(--mk-on-accent)] transition-colors hover:bg-[color:var(--mk-accent-hover)] disabled:opacity-50"
      >
        {pending ? 'One moment…' : 'Continue'}
      </button>
    </form>
  )
}
