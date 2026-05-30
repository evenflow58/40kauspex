import { test, expect } from '../fixtures'

test.describe('authenticated', () => {
  test('home page loads without redirect to login', async ({ authedPage }) => {
    await authedPage.goto('/')
    await expect(authedPage).not.toHaveURL(/\/login/)
    await expect(authedPage.locator('body')).not.toBeEmpty()
  })

  test('shell header shows the app title', async ({ authedPage }) => {
    await authedPage.goto('/')
    await expect(
      authedPage.getByRole('heading', { name: /40K Auspex/i })
    ).toBeVisible()
  })

  test('primary navigation has Home and Companion links', async ({
    authedPage,
  }) => {
    await authedPage.goto('/')
    await expect(
      authedPage.getByRole('link', { name: /home/i })
    ).toBeVisible()
    await expect(
      authedPage.getByRole('link', { name: /companion/i })
    ).toBeVisible()
  })

  test('clicking the Companion nav link navigates to /companion', async ({
    authedPage,
  }) => {
    await authedPage.goto('/')
    await authedPage.getByRole('link', { name: /companion/i }).click()
    await expect(authedPage).toHaveURL(/\/companion/)
  })

  test('companion page shows the game selection heading', async ({
    authedPage,
  }) => {
    await authedPage.goto('/companion')
    await expect(
      authedPage.getByRole('heading', { name: /choose your game/i })
    ).toBeVisible({ timeout: 15_000 })
  })

  test('sign out button is visible in the authenticated layout', async ({
    authedPage,
  }) => {
    await authedPage.goto('/')
    await expect(
      authedPage.getByRole('button', { name: /sign out/i })
    ).toBeVisible()
  })
})
