/**
 * Shared visual shell for transactional emails.
 *
 * The first three templates (confirm-signup, login-link, team-invite) each
 * carry their own copy of the palette and layout; this module hoists that
 * convention for every template written since, so a colour change is one
 * edit, not N. Same email-is-not-the-web constraints as the originals:
 * inline styles, table layout, system-font fallbacks, no webfonts.
 */

export const INK = '#25313d'
export const HEADING = '#34475b'
export const ACCENT = '#f03e6a'
export const PAPER = '#fbfaf8'
export const RULE = '#e4e2dc'
export const FAINT = '#8b949e'

export const SANS = "'Poppins', -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
export const MONO = "'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export type EmailShellInput = {
  /** Already-escaped document title. */
  title: string
  /** Inbox preview line. Plain text; escaped here. */
  preheader: string
  /** The card's inner rows — trusted, template-built HTML. */
  bodyRows: string
}

/**
 * The standard Growthable card: paper background, 520px white card, wordmark
 * header. Body rows are `<tr><td>…</td></tr>` fragments from the template.
 */
export function emailShell(input: EmailShellInput): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width">
<title>${input.title}</title>
</head>
<body style="margin:0;padding:0;background:${PAPER};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(input.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${PAPER};padding:32px 16px;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border:1px solid ${RULE};border-radius:12px;">
<tr><td style="padding:28px 32px 0 32px;">
<span style="font-family:${SANS};font-size:19px;font-weight:800;letter-spacing:-0.02em;color:${HEADING};">Growthable</span>
</td></tr>
${input.bodyRows}
</table>
</td></tr>
</table>
</body>
</html>`
}

/** The uppercase mono kicker above the headline. */
export function kickerRow(text: string): string {
  return `<tr><td style="padding:22px 32px 0 32px;">
<span style="font-family:${MONO};font-size:11px;letter-spacing:0.14em;text-transform:uppercase;color:${ACCENT};">${escapeHtml(text)}</span>
</td></tr>`
}

export function headlineRow(html: string): string {
  return `<tr><td style="padding:10px 32px 0 32px;">
<h1 style="margin:0;font-family:${SANS};font-size:27px;line-height:1.15;font-weight:800;letter-spacing:-0.025em;color:${HEADING};">${html}</h1>
</td></tr>`
}

export function paragraphRow(html: string): string {
  return `<tr><td style="padding:16px 32px 0 32px;">
<p style="margin:0;font-family:${SANS};font-size:15px;line-height:1.6;color:${INK};">${html}</p>
</td></tr>`
}

export function buttonRow(url: string, label: string): string {
  return `<tr><td style="padding:24px 32px 0 32px;">
<a href="${escapeHtml(url)}" style="display:inline-block;background:${ACCENT};color:#ffffff;font-family:${SANS};font-size:15px;font-weight:600;text-decoration:none;padding:13px 26px;border-radius:8px;">${escapeHtml(label)}</a>
</td></tr>`
}

export function footnoteRow(html: string): string {
  return `<tr><td style="padding:22px 32px 0 32px;">
<p style="margin:0;font-family:${SANS};font-size:13px;line-height:1.6;color:${FAINT};">${html}</p>
</td></tr>`
}

/** Closing row with the fallback URL, bordered off from the body. */
export function fallbackUrlRow(url: string): string {
  const escaped = escapeHtml(url)
  return `<tr><td style="padding:22px 32px 26px 32px;border-top:1px solid ${RULE};margin-top:22px;">
<p style="margin:22px 0 0 0;font-family:${SANS};font-size:12px;line-height:1.6;color:${FAINT};">If the button does not work, paste this into your browser:<br><span style="font-family:${MONO};color:${INK};word-break:break-all;">${escaped}</span></p>
</td></tr>`
}
