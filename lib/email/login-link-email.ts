/**
 * The login magic-link email — the /login form's counterpart to the
 * funnel's confirmation email, in the same reviewed-and-versioned file
 * style and the same visual language (see confirm-signup-email.ts for
 * the email-is-not-the-web constraints: inline styles, table layout,
 * system-font fallbacks).
 */

const INK = '#25313d'
const HEADING = '#34475b'
const ACCENT = '#f03e6a'
const PAPER = '#fbfaf8'
const RULE = '#e4e2dc'
const FAINT = '#8b949e'

export type LoginEmailInput = {
  loginUrl: string
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function loginLinkSubject(): string {
  return 'Your Growthable sign-in link'
}

export function loginLinkText(input: LoginEmailInput): string {
  return [
    'Here is your sign-in link:',
    '',
    input.loginUrl,
    '',
    'It expires in an hour and works once. If you did not ask for it you can ignore this email — nobody can sign in without it.',
    '',
    'Growthable',
  ].join('\n')
}

export function loginLinkHtml(input: LoginEmailInput): string {
  const url = escapeHtml(input.loginUrl)
  const sans = "'Poppins', -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
  const mono = "'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width">
<title>${escapeHtml(loginLinkSubject())}</title>
</head>
<body style="margin:0;padding:0;background:${PAPER};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">One click signs you in to your help centre dashboard.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${PAPER};padding:32px 16px;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border:1px solid ${RULE};border-radius:12px;">
<tr><td style="padding:28px 32px 0 32px;">
<span style="font-family:${sans};font-size:19px;font-weight:800;letter-spacing:-0.02em;color:${HEADING};">Growthable</span>
</td></tr>
<tr><td style="padding:22px 32px 0 32px;">
<span style="font-family:${mono};font-size:11px;letter-spacing:0.14em;text-transform:uppercase;color:${ACCENT};">Sign in</span>
</td></tr>
<tr><td style="padding:10px 32px 0 32px;">
<h1 style="margin:0;font-family:${sans};font-size:27px;line-height:1.15;font-weight:800;letter-spacing:-0.025em;color:${HEADING};">Your sign-in link is ready.</h1>
</td></tr>
<tr><td style="padding:16px 32px 0 32px;">
<p style="margin:0;font-family:${sans};font-size:15px;line-height:1.6;color:${INK};">One click below signs you in to your help centre dashboard. No password, nothing to remember.</p>
</td></tr>
<tr><td style="padding:24px 32px 0 32px;">
<a href="${url}" style="display:inline-block;background:${ACCENT};color:#ffffff;font-family:${sans};font-size:15px;font-weight:600;text-decoration:none;padding:13px 26px;border-radius:8px;">Sign in</a>
</td></tr>
<tr><td style="padding:22px 32px 0 32px;">
<p style="margin:0;font-family:${sans};font-size:13px;line-height:1.6;color:${FAINT};">The link expires in an hour and works once. If you did not ask for it you can ignore this email — nobody can sign in without it.</p>
</td></tr>
<tr><td style="padding:22px 32px 26px 32px;border-top:1px solid ${RULE};margin-top:22px;">
<p style="margin:22px 0 0 0;font-family:${sans};font-size:12px;line-height:1.6;color:${FAINT};">If the button does not work, paste this into your browser:<br><span style="font-family:${mono};color:${INK};word-break:break-all;">${url}</span></p>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`
}
