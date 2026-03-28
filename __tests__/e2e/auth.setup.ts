import { test as setup, expect } from '@playwright/test'
import path from 'path'

/**
 * Auth setup — logs in once and saves the session to disk.
 * All other E2E tests reuse this session (no repeated login).
 *
 * Requires env vars:
 *   TEST_USER_EMAIL    — email of a Partner (admin) account
 *   TEST_USER_PASSWORD — password for that account
 */

const SESSION_FILE = path.join(__dirname, '.auth/session.json')

setup('authenticate as Partner', async ({ page }) => {
  const email = process.env.TEST_USER_EMAIL
  const password = process.env.TEST_USER_PASSWORD

  if (!email || !password) {
    throw new Error(
      'Set TEST_USER_EMAIL and TEST_USER_PASSWORD in .env.local before running E2E tests.',
    )
  }

  await page.goto('/login')
  await expect(page).toHaveTitle(/Kairos|Login/, { timeout: 10_000 })

  await page.getByLabel(/email/i).fill(email)
  await page.getByLabel(/password/i).fill(password)
  await page.getByRole('button', { name: /sign in|log in/i }).click()

  // Wait for redirect to dashboard after successful login
  await page.waitForURL('**/dashboard', { timeout: 15_000 })
  await expect(page.getByText(/dashboard/i)).toBeVisible()

  await page.context().storageState({ path: SESSION_FILE })
})
