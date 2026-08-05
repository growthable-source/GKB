import { writeFileSync } from 'node:fs'
import {
  confirmSignupHtml,
  confirmSignupSubject,
  confirmSignupText,
} from '@/lib/email/confirm-signup-email'

/** Renders the confirmation email to a file so it can be eyeballed without sending one. */
const input = {
  fullName: 'Alex Reid',
  centerName: 'Acme Agency',
  centerPath: '/hc/acme-agency',
  confirmUrl:
    'https://whitelabelghl.growthable.io/auth/confirm?token_hash=abc123def456&type=magiclink',
}

const out = process.argv[2] ?? 'email-preview.html'
writeFileSync(out, confirmSignupHtml(input))
console.log('SUBJECT:', confirmSignupSubject(input.centerName))
console.log('WROTE:', out)
console.log('---TEXT---')
console.log(confirmSignupText(input))
