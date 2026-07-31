'use client'

import { useActionState } from 'react'
import { sendMagicLink } from './actions'

export default function LoginPage() {
  const [state, action, pending] = useActionState(sendMagicLink, null)

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 px-6">
      <h1 className="text-2xl font-semibold">Sign in</h1>

      {state?.sent ? (
        <p className="text-sm text-neutral-600">
          Check your email for a sign-in link.
        </p>
      ) : (
        <form action={action} className="flex flex-col gap-3">
          <input
            name="email"
            type="email"
            required
            placeholder="you@company.com"
            className="rounded-md border border-neutral-300 px-3 py-2"
          />
          <button
            type="submit"
            disabled={pending}
            className="rounded-md bg-neutral-900 px-3 py-2 text-white disabled:opacity-50"
          >
            {pending ? 'Sending…' : 'Email me a link'}
          </button>
          {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
        </form>
      )}
    </main>
  )
}
