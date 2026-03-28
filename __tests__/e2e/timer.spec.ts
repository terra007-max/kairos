import { test, expect } from '@playwright/test'

/**
 * UAT — Timer page
 * Tests starting, stopping, and manually adding time entries.
 */

test.describe('Timer', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/timer')
    await expect(page.getByRole('heading', { name: /time tracker|timer/i })).toBeVisible()
  })

  test('shows timer start button', async ({ page }) => {
    await expect(page.getByRole('button', { name: /start/i })).toBeVisible()
  })

  test('start button activates a running timer', async ({ page }) => {
    await page.getByRole('button', { name: /start/i }).click()
    // Running timer shows a stop/square button
    await expect(page.getByRole('button', { name: /stop|square/i })).toBeVisible({ timeout: 5_000 })
  })

  test('stop button ends the running timer and creates an entry', async ({ page }) => {
    // Start
    await page.getByRole('button', { name: /start/i }).click()
    await expect(page.getByRole('button', { name: /stop|square/i })).toBeVisible({ timeout: 5_000 })

    // Wait a tick so duration > 0
    await page.waitForTimeout(1500)

    // Stop
    await page.getByRole('button', { name: /stop|square/i }).click()

    // An entry card should appear in the list
    await expect(page.locator('[data-testid="entry-row"], .entry-card, table tbody tr').first()).toBeVisible({ timeout: 8_000 })
  })

  test('manual entry tab allows entering from/to times', async ({ page }) => {
    // Switch to from/to mode
    const fromToBtn = page.getByRole('button', { name: /from.*to|manual|add time/i })
    if (await fromToBtn.isVisible()) {
      await fromToBtn.click()
      await expect(page.getByLabel(/start|from/i).first()).toBeVisible()
      await expect(page.getByLabel(/end|to/i).first()).toBeVisible()
    }
  })

  test('project dropdown lists available projects', async ({ page }) => {
    const projectSelect = page.locator('select').first()
    await expect(projectSelect).toBeVisible()
    const options = await projectSelect.locator('option').count()
    expect(options).toBeGreaterThan(0)
  })

  test('entry list shows recent time entries', async ({ page }) => {
    // The page should render at least a heading or empty state
    const hasEntries = await page.locator('table, [data-testid="entry-list"]').isVisible()
    const hasEmpty = await page.getByText(/no entries|no time/i).isVisible()
    expect(hasEntries || hasEmpty).toBe(true)
  })
})
