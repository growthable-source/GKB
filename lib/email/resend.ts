export type SendEmailInput = {
  to: string
  subject: string
  html: string
  text: string
}

export class EmailNotConfiguredError extends Error {
  constructor() {
    super('RESEND_API_KEY is not set')
    this.name = 'EmailNotConfiguredError'
  }
}

/** Whether this deployment can send its own mail. */
export function canSendEmail(): boolean {
  return Boolean(process.env.RESEND_API_KEY)
}

/**
 * Sends one transactional email through Resend.
 *
 * Deliberately a plain fetch rather than the SDK: one endpoint, one shape, and
 * nothing here benefits from a client object. The sender must be on a domain
 * verified in Resend — that is the whole of Resend's authorisation model, and
 * an unverified from-address fails at send rather than at deploy.
 */
export async function sendEmail(input: SendEmailInput): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) throw new EmailNotConfiguredError()

  const from = process.env.RESEND_FROM ?? 'Growthable <help@growthable.io>'

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: [input.to],
      subject: input.subject,
      html: input.html,
      text: input.text,
    }),
  })

  if (!response.ok) {
    // Resend puts the useful part in the body; the status alone rarely says
    // which of domain, key, or address was wrong.
    const detail = await response.text().catch(() => '')
    throw new Error(`Resend returned ${response.status}: ${detail.slice(0, 300)}`)
  }
}
