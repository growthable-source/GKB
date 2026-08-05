/**
 * The survey, defined once and read by both the routing and the screens.
 *
 * Options are plain strings stored verbatim in `signups`. They are marketing
 * taxonomy, not application logic — nothing branches on them — so rewording an
 * option is a change to this file and nothing else.
 */

export type SurveyStep = {
  /** Matches the `signups.step` check constraint and the URL segment. */
  id: 'role' | 'company_size' | 'agency_name' | 'subaccount_count' | 'opt_in'
  /** The database column the answer lands in. */
  column: 'role' | 'company_size' | 'agency_name' | 'subaccount_count' | 'marketing_opt_in'
  question: string
  hint?: string
  kind: 'choice' | 'text' | 'consent'
  options?: string[]
  placeholder?: string
}

export const SURVEY_STEPS: SurveyStep[] = [
  {
    id: 'role',
    column: 'role',
    question: 'What do you do at your agency?',
    kind: 'choice',
    options: ['Agency owner', 'Marketing lead', 'Support lead', 'Developer', 'Something else'],
  },
  {
    id: 'company_size',
    column: 'company_size',
    question: 'How many people work there?',
    kind: 'choice',
    options: ['Just me', '2–5', '6–20', '21–50', '51–200', '200+'],
  },
  {
    id: 'agency_name',
    column: 'agency_name',
    question: "What's your agency called?",
    hint: 'This becomes the name on your help centre. You can change it later.',
    kind: 'text',
    placeholder: 'Acme Agency',
  },
  {
    id: 'subaccount_count',
    column: 'subaccount_count',
    question: 'How many sub-accounts do you run?',
    kind: 'choice',
    options: ['1–10', '11–50', '51–200', '201–500', '500+'],
  },
  {
    id: 'opt_in',
    column: 'marketing_opt_in',
    question: 'One last thing',
    hint: 'Your help centre is free. In exchange we send you occasional email about Growthable, and you can unsubscribe from any of it.',
    kind: 'consent',
  },
]

export const SURVEY_STEP_IDS = SURVEY_STEPS.map((step) => step.id)

export function findSurveyStep(id: string): SurveyStep | undefined {
  return SURVEY_STEPS.find((step) => step.id === id)
}

/** The step after `id`, or null when `id` is the last one. */
export function nextSurveyStepId(id: string): string | null {
  const index = SURVEY_STEP_IDS.indexOf(id as SurveyStep['id'])
  if (index === -1 || index === SURVEY_STEP_IDS.length - 1) return null
  return SURVEY_STEP_IDS[index + 1]
}

/** 1-based position, for the progress indicator. */
export function surveyProgress(id: string): { position: number; total: number } {
  return {
    position: SURVEY_STEP_IDS.indexOf(id as SurveyStep['id']) + 1,
    total: SURVEY_STEP_IDS.length,
  }
}

/**
 * Where a saved `signups.step` should send someone who comes back.
 *
 * Every step maps to exactly one URL so a resume never has to guess, and the
 * terminal steps land on the claim screen rather than replaying the funnel.
 */
export function stepToPath(step: string): string {
  if (step === 'details') return '/get/details'
  if (step === 'build') return '/get/build'
  if (step === 'claim' || step === 'done') return '/get/check-email'
  if (SURVEY_STEP_IDS.includes(step as SurveyStep['id'])) return `/get/survey/${step}`
  return '/get/details'
}
