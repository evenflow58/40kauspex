import { test, expect } from '../fixtures'

test.describe('authenticated', () => {
  test('home page loads without redirect to login', async ({ authedPage }) => {
    await authedPage.goto('/')
    await expect(authedPage).not.toHaveURL(/\/login/)
    // The MFE shell should render something — not a blank page
    await expect(authedPage.locator('body')).not.toBeEmpty()
  })
})
