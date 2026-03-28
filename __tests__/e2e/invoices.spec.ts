import { test, expect } from '@playwright/test'

/**
 * UAT — Invoices (Partner only)
 * Verifies the invoice generation flow, history tab, and that
 * the Generate button is disabled when no approved hours exist.
 */

test.describe('Invoices', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/invoices')
    await expect(page.getByRole('heading', { name: /invoices/i })).toBeVisible()
  })

  test('shows Generate and History tabs', async ({ page }) => {
    await expect(page.getByRole('button', { name: /generate invoice/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /saved invoices/i })).toBeVisible()
  })

  test('Generate tab shows client selector', async ({ page }) => {
    await expect(page.getByLabel(/client/i)).toBeVisible()
  })

  test('Generate tab shows date range pickers', async ({ page }) => {
    await expect(page.getByLabel(/from date/i)).toBeVisible()
    await expect(page.getByLabel(/to date/i)).toBeVisible()
  })

  test('Generate Invoice button is disabled until a client is selected', async ({ page }) => {
    const generateBtn = page.getByRole('button', { name: /generate invoice/i }).last()
    // Before selecting client, button should not be visible or enabled
    await expect(generateBtn).not.toBeEnabled()
  })

  test('selecting a client loads the hours summary panel', async ({ page }) => {
    const clientSelect = page.getByLabel(/client/i)
    const options = await clientSelect.locator('option').allInnerTexts()
    const realClients = options.filter(o => o !== 'Select client' && o !== '')

    if (realClients.length > 0) {
      await clientSelect.selectOption({ label: realClients[0] })
      // Hours summary panel should appear
      await expect(page.getByText(/hours available to bill/i)).toBeVisible({ timeout: 8_000 })
    }
  })

  test('Generate button is disabled when no approved hours exist', async ({ page }) => {
    const clientSelect = page.getByLabel(/client/i)
    const options = await clientSelect.locator('option').allInnerTexts()
    const realClients = options.filter(o => o !== 'Select client' && o !== '')

    if (realClients.length > 0) {
      await clientSelect.selectOption({ label: realClients[0] })
      await page.waitForTimeout(1000)

      const approvedText = page.getByText(/\d+h approved/i)
      const hasApproved = await approvedText.isVisible()
      if (!hasApproved) {
        const generateBtn = page.getByRole('button', { name: /generate invoice.*approved/i })
        await expect(generateBtn).toBeDisabled()
      }
    }
  })

  test('History tab shows saved invoices or empty state', async ({ page }) => {
    await page.getByRole('button', { name: /saved invoices/i }).click()
    const hasInvoices = await page.locator('.card .font-semibold').count() > 0
    const hasEmpty = await page.getByText(/no saved invoices/i).isVisible()
    expect(hasInvoices || hasEmpty).toBe(true)
  })

  test('History tab invoice cards show amount and status badge', async ({ page }) => {
    await page.getByRole('button', { name: /saved invoices/i }).click()
    const invoiceCards = page.locator('.card').filter({ hasText: /€/ })
    const count = await invoiceCards.count()
    if (count > 0) {
      const firstCard = invoiceCards.first()
      // Should show a monetary amount and a status badge
      await expect(firstCard.getByText(/€/)).toBeVisible()
      await expect(firstCard.getByText(/sent|paid|draft/i)).toBeVisible()
    }
  })
})
