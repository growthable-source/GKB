'use client'

import { useActionState, useState } from 'react'
import type { SurveyStep } from '@/lib/signup/survey'
import type { FunnelState } from '@/app/(marketing)/get/actions'

const BUTTON =
  'cursor-pointer rounded-lg bg-[color:var(--mk-accent)] px-5 py-3 font-medium text-[color:var(--mk-on-accent)] transition-colors hover:bg-[color:var(--mk-accent-hover)] disabled:opacity-50'

/**
 * One question, one screen.
 *
 * Choices submit on click rather than making the reader find a Continue button
 * — a five-question survey should cost five clicks, not ten. The text and
 * consent steps keep an explicit button because they have nothing to click.
 */
export function SurveyForm({
  action,
  step,
  existing,
}: {
  action: (prev: FunnelState | null, formData: FormData) => Promise<FunnelState>
  step: SurveyStep
  existing: string | null
}) {
  const [state, formAction, pending] = useActionState(action, null)
  const [choice, setChoice] = useState(existing ?? '')
  const [consented, setConsented] = useState(true)

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="step" value={step.id} />

      {step.kind === 'choice' && (
        <>
          <input type="hidden" name="answer" value={choice} />
          <div className="flex flex-col gap-2.5">
            {step.options?.map((option, index) => (
              <button
                key={option}
                type="submit"
                disabled={pending}
                onClick={() => setChoice(option)}
                className={`flex cursor-pointer items-center gap-3 rounded-lg border px-4 py-3 text-left transition-colors disabled:opacity-60 ${
                  choice === option
                    ? 'border-[color:var(--mk-accent)] bg-[color:var(--mk-surface)]'
                    : 'border-[color:var(--mk-rule-strong)] bg-[color:var(--mk-surface)] hover:border-[color:var(--mk-accent)]'
                }`}
              >
                <span className="mk-mono text-xs text-[color:var(--mk-ink-faint)]">
                  {index + 1}
                </span>
                <span>{option}</span>
              </button>
            ))}
          </div>
        </>
      )}

      {step.kind === 'text' && (
        <>
          <label className="sr-only" htmlFor="answer">
            {step.question}
          </label>
          <input
            id="answer"
            name="answer"
            required
            defaultValue={existing ?? ''}
            autoFocus
            placeholder={step.placeholder}
            className="w-full rounded-lg border border-[color:var(--mk-rule-strong)] bg-[color:var(--mk-surface)] px-3.5 py-3 text-[color:var(--mk-ink)] placeholder:text-[color:var(--mk-ink-faint)] focus:outline-2 focus:outline-offset-1 focus:outline-[color:var(--mk-accent)]"
          />
          <button type="submit" disabled={pending} className={`${BUTTON} w-fit`}>
            {pending ? 'Saving…' : 'Continue'}
          </button>
        </>
      )}

      {step.kind === 'consent' && (
        <>
          <label className="flex items-start gap-3 rounded-lg border border-[color:var(--mk-rule-strong)] bg-[color:var(--mk-surface)] p-4">
            <input
              type="checkbox"
              name="answer"
              checked={consented}
              onChange={(event) => setConsented(event.target.checked)}
              className="mt-1 accent-[color:var(--mk-accent)]"
            />
            <span className="text-sm">
              Email me about Growthable — product updates, and how other agencies are using their
              help centres. Unsubscribe whenever you like.
            </span>
          </label>
          <button type="submit" disabled={pending || !consented} className={`${BUTTON} w-fit`}>
            {pending ? 'Saving…' : 'Build my help centre'}
          </button>
          {!consented && (
            <p className="text-sm text-[color:var(--mk-ink-faint)]">
              The mailing list is what makes this free. It has to stay ticked.
            </p>
          )}
        </>
      )}

      {state?.error && <p className="text-sm text-[color:var(--mk-accent)]">{state.error}</p>}
    </form>
  )
}
