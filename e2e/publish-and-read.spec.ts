import { expect, test } from '@playwright/test'

// Non-idempotent suite: requires a fresh `pnpm db:reset` plus the one-time owner
// membership grant (Task 15 Step 6 SQL) before running.
const MAIL_API = 'http://127.0.0.1:54724/api/v1'
const EMAIL = 'owner@example.com'

async function mailApi(path: string) {
  const res = await fetch(`${MAIL_API}${path}`)
  if (!res.ok) throw new Error(`Mailpit request failed (${res.status}) — is supabase running on 54724?`)
  return res.json()
}

async function signIn(page: import('@playwright/test').Page) {
  await page.goto('/login')
  await page.getByPlaceholder('you@company.com').fill(EMAIL)
  await page.getByRole('button', { name: /email me a link/i }).click()
  await expect(page.getByText(/check your email/i)).toBeVisible()

  const { messages } = await mailApi('/messages')
  const latest = messages
    .filter((m: { To: { Address: string }[] }) => m.To.some((to) => to.Address === EMAIL))
    .sort((a: { Created: string }, b: { Created: string }) => (a.Created < b.Created ? 1 : -1))[0]
  expect(latest, 'magic link email received').toBeTruthy()
  const message = await mailApi(`/message/${latest.ID}`)

  const link = /href="([^"]*\/auth\/confirm[^"]*)"/.exec(message.HTML)?.[1]
  expect(link, 'magic link in email').toBeTruthy()

  // The email links to Supabase's configured site_url, which may not be the e2e port — navigate by path so it resolves against baseURL.
  const url = new URL(link!.replace(/&amp;/g, '&'))
  await page.goto(url.pathname + url.search)
}

test('an author publishes an article and a reader finds it', async ({ page }) => {
  await signIn(page)

  // Create a collection.
  await page.goto('/admin/collections')
  await page.getByPlaceholder('Collection title').fill('Billing')
  await page.getByPlaceholder('Short description').fill('Invoices and payments.')
  await page.getByRole('button', { name: 'Add collection' }).click()
  await expect(page.getByText('/billing')).toBeVisible()

  // Write and publish an article.
  await page.goto('/admin/articles')
  await page.getByRole('button', { name: 'New article' }).click()
  await page.getByPlaceholder('Article title').fill('Cancel your subscription')
  await page.getByRole('combobox').selectOption({ label: 'Billing' })
  await page.locator('.ProseMirror').click()
  await page.keyboard.type('Open settings and choose cancel plan to stop billing.')
  await page.getByRole('button', { name: 'Save and publish' }).click()
  await expect(page.getByText('Saved')).toBeVisible()

  // Read it publicly.
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Billing' })).toBeVisible()
  await page.getByRole('link', { name: /Billing/ }).click()
  await page.getByRole('link', { name: 'Cancel your subscription' }).click()
  await expect(page.getByRole('heading', { name: 'Cancel your subscription' })).toBeVisible()
  await expect(page.getByText(/stop billing/i)).toBeVisible()

  // Find it by search.
  await page.goto('/search?q=cancel+plan')
  await expect(page.getByRole('heading', { name: 'Cancel your subscription' })).toBeVisible()
})

test('a draft article is not publicly readable', async ({ page }) => {
  await signIn(page)

  await page.goto('/admin/articles')
  await page.getByRole('button', { name: 'New article' }).click()
  await page.getByPlaceholder('Article title').fill('Internal runbook')
  await page.locator('.ProseMirror').click()
  await page.keyboard.type('Secret internal steps.')
  await page.getByRole('button', { name: 'Save draft' }).click()
  await expect(page.getByText('Saved')).toBeVisible()

  await page.goto('/search?q=secret')
  await expect(page.getByText(/nothing matched/i)).toBeVisible()
})
