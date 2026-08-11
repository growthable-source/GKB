import { notFound, redirect } from 'next/navigation'
import { readSignupToken } from '@/lib/signup/session'
import { findSignupByToken } from '@/lib/signup/repository'
import { findSurveyStep, surveyProgress } from '@/lib/signup/survey'
import { submitSurveyStep } from '../../actions'
import { SurveyForm } from '@/components/marketing/survey-form'

export const metadata = { title: 'A few questions — Growthable' }

export default async function SurveyStepPage({
  params,
}: {
  params: Promise<{ step: string }>
}) {
  const { step: stepId } = await params
  const step = findSurveyStep(stepId)
  if (!step) notFound()

  const token = await readSignupToken()
  const signup = token ? await findSignupByToken(token) : null
  // No row means no funnel. Send them to the one screen that starts one rather
  // than rendering a question whose answer has nowhere to go.
  if (!signup) redirect('/get/details')
  if (signup.claimed_at) redirect('/dashboard')

  const { position, total } = surveyProgress(step.id)
  const existing =
    step.kind === 'consent' ? null : ((signup[step.column] as string | null) ?? null)

  return (
    <main className="mx-auto flex max-w-xl flex-col gap-7 px-5 py-16 sm:px-8 sm:py-24">
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-3">
          {/* No mk-eyebrow here: the progress rule beside it already carries
              the accent dash, and two in a row read as a mistake. */}
          <p className="mk-mono text-xs whitespace-nowrap uppercase tracking-[0.14em] text-[color:var(--mk-accent)]">
            Step {position + 1} of {total + 2}
          </p>
          <div
            className="h-px flex-1 bg-[color:var(--mk-rule)]"
            role="progressbar"
            aria-valuenow={position}
            aria-valuemin={0}
            aria-valuemax={total}
            aria-label="Survey progress"
          >
            <div
              className="h-px bg-[color:var(--mk-accent)]"
              style={{ width: `${(position / total) * 100}%` }}
            />
          </div>
        </div>

        <h1 className="text-3xl tracking-tight sm:text-4xl">{step.question}</h1>
        {step.hint && <p className="text-[color:var(--mk-ink-soft)]">{step.hint}</p>}
      </div>

      <SurveyForm action={submitSurveyStep} step={step} existing={existing} />
    </main>
  )
}
