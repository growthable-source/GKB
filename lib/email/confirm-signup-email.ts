/**
 * The confirmation email.
 *
 * Lives here rather than in a dashboard text box so it is reviewed, versioned,
 * and changes alongside the funnel it belongs to.
 *
 * Email is not the web: no webfonts (clients strip the @font-face), no CSS
 * files, no flexbox worth relying on. Everything is inline, the layout is a
 * table, and the brand survives through colour and weight rather than through
 * Poppins — which will fall back to a system sans in most clients and should
 * still look deliberate when it does.
 */

const INK = '#25313d'
const HEADING = '#34475b'
const ACCENT = '#f03e6a'
const PAPER = '#fbfaf8'
const RULE = '#e4e2dc'
const FAINT = '#8b949e'

export type ConfirmEmailInput = {
  fullName: string
  centerName: string
  centerPath: string
  confirmUrl: string
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function confirmSignupSubject(centerName: string): string {
  return `Confirm your email and ${centerName} goes live`
}

export function confirmSignupText(input: ConfirmEmailInput): string {
  return [
    `Hi ${input.fullName},`,
    '',
    `You're one click from your own help centre. Opening this link confirms your email, creates ${input.centerName}, and signs you in:`,
    '',
    input.confirmUrl,
    '',
    `Your help centre will live at ${input.centerPath} and arrives fully populated — every published article is already in it.`,
    '',
    'The link expires in an hour. If you did not request it you can ignore this email.',
    '',
    'Growthable',
  ].join('\n')
}

export function confirmSignupHtml(input: ConfirmEmailInput): string {
  const name = escapeHtml(input.fullName)
  const centerName = escapeHtml(input.centerName)
  const centerPath = escapeHtml(input.centerPath)
  const url = escapeHtml(input.confirmUrl)
  const sans = "'Poppins', -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
  const mono = "'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width">
<title>${escapeHtml(confirmSignupSubject(input.centerName))}</title>
</head>
<body style="margin:0;padding:0;background:${PAPER};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">One click confirms your email and puts ${centerName} live.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${PAPER};padding:32px 16px;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border:1px solid ${RULE};border-radius:12px;">
<tr><td style="padding:28px 32px 0 32px;">
<span style="font-family:${sans};font-size:19px;font-weight:800;letter-spacing:-0.02em;color:${HEADING};">Growthable</span>
</td></tr>
<tr><td style="padding:22px 32px 0 32px;">
<span style="font-family:${mono};font-size:11px;letter-spacing:0.14em;text-transform:uppercase;color:${ACCENT};">One click left</span>
</td></tr>
<tr><td style="padding:10px 32px 0 32px;">
<h1 style="margin:0;font-family:${sans};font-size:27px;line-height:1.15;font-weight:800;letter-spacing:-0.025em;color:${HEADING};">Confirm your email and ${centerName} goes live.</h1>
</td></tr>
<tr><td style="padding:16px 32px 0 32px;">
<p style="margin:0;font-family:${sans};font-size:15px;line-height:1.6;color:${INK};">Hi ${name}, opening the link below confirms your address, creates your help centre, and signs you in. It arrives fully populated — every published article is already in it.</p>
</td></tr>
<tr><td style="padding:24px 32px 0 32px;">
<a href="${url}" style="display:inline-block;background:${ACCENT};color:#ffffff;font-family:${sans};font-size:15px;font-weight:600;text-decoration:none;padding:13px 26px;border-radius:8px;">Confirm and go live</a>
</td></tr>
<tr><td style="padding:22px 32px 0 32px;">
<p style="margin:0;font-family:${sans};font-size:13px;line-height:1.6;color:${FAINT};">Your address will be <span style="font-family:${mono};color:${INK};">${centerPath}</span>. The link expires in an hour, and if you did not ask for it you can ignore this email.</p>
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
