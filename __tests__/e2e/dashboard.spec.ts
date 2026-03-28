import { test, expect } from '@playwright/test'

/**
 * UAT — Dashboard
 * Verifies the Partner dashboard loads with expected KPI cards
 * and that navigation links are visible.
 */

test.describe('Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/dashboard')
  })

  test('loads and shows utilization KPI cards', async ({ page }) => {
    await expect(page.getByText(/utilization/i).first()).toBeVisible()
  })

  test('shows this week and this month cards', async ({ page }) => {
    await expect(page.getByText(/this week/i)).toBeVisible()
    await expect(page.getByText(/this month/i)).toBeVisible()
  })

  test('sidebar navigation links are present', async ({ page }) => {
    await expect(page.getByRole('link', { name: /timer/i })).toBeVisible()
    await expect(page.getByRole('link', { name: /projects/i })).toBeVisible()
    await expect(page.getByRole('link', { name: /timesheets/i })).toBeVisible()
  })

  test('shows Partner role badge', async ({ page }) => {
    await expect(page.getByText(/partner/i)).toBeVisible()
  })
})
