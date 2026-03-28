import { test, expect } from '@playwright/test'

/**
 * UAT — Timesheets
 * Verifies the timesheets page loads, tabs switch correctly,
 * and the current week summary is displayed.
 */

test.describe('Timesheets', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/timesheets')
    await expect(page.getByRole('heading', { name: /timesheets/i })).toBeVisible()
  })

  test('shows "My Timesheets" and "Review" tabs for a Partner', async ({ page }) => {
    await expect(page.getByRole('button', { name: /my timesheets/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /review/i })).toBeVisible()
  })

  test('defaults to Review tab for a Partner', async ({ page }) => {
    // Partners default to the team/review tab
    const reviewTab = page.getByRole('button', { name: /review/i })
    await expect(reviewTab).toHaveClass(/bg-card|shadow/)
  })

  test('"My Timesheets" tab shows week navigation', async ({ page }) => {
    await page.getByRole('button', { name: /my timesheets/i }).click()
    await expect(page.getByText(/KW \d+/)).toBeVisible()
  })

  test('week navigation prev/next buttons are present', async ({ page }) => {
    await page.getByRole('button', { name: /my timesheets/i }).click()
    // chevron buttons (left/right)
    const chevrons = page.locator('button svg.lucide-chevron-left, button svg.lucide-chevron-right')
    expect(await chevrons.count()).toBeGreaterThanOrEqual(1)
  })

  test('shows hours tracked for the current week', async ({ page }) => {
    await page.getByRole('button', { name: /my timesheets/i }).click()
    await expect(page.getByText(/\d+\.\d+h/)).toBeVisible()
  })

  test('submit button is disabled when 0 hours tracked', async ({ page }) => {
    await page.getByRole('button', { name: /my timesheets/i }).click()
    const zeroHours = await page.getByText(/0\.0h/).isVisible()
    if (zeroHours) {
      const submitBtn = page.getByRole('button', { name: /submit for review/i })
      await expect(submitBtn).toBeDisabled()
    }
  })

  test('Review tab shows team timesheets list or empty state', async ({ page }) => {
    await page.getByRole('button', { name: /review/i }).click()
    const hasList = await page.locator('.card').count() > 0
    const hasEmpty = await page.getByText(/no timesheets/i).isVisible()
    expect(hasList || hasEmpty).toBe(true)
  })
})
