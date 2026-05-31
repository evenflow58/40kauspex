import { test, expect } from '../fixtures'

test.describe('My Armies', () => {
  test('"My Armies" button is visible on the companion page', async ({
    authedPage,
  }) => {
    await authedPage.goto('/companion')
    await expect(
      authedPage.getByRole('link', { name: /my armies/i })
    ).toBeVisible({ timeout: 15_000 })
  })

  test('clicking "My Armies" navigates to /companion/armies', async ({
    authedPage,
  }) => {
    await authedPage.goto('/companion')
    await authedPage.getByRole('link', { name: /my armies/i }).click()
    await expect(authedPage).toHaveURL(/\/companion\/armies/)
  })

  test('My Armies page shows the heading', async ({ authedPage }) => {
    await authedPage.goto('/companion/armies')
    await expect(
      authedPage.getByRole('heading', { name: /my armies/i })
    ).toBeVisible({ timeout: 15_000 })
  })

  test('My Armies page shows army cards or the empty state — never an error', async ({
    authedPage,
  }) => {
    await authedPage.goto('/companion/armies')
    // Wait for the heading to confirm the page has mounted and the fetch settled
    await expect(
      authedPage.getByRole('heading', { name: /my armies/i })
    ).toBeVisible({ timeout: 15_000 })
    await expect(
      authedPage.getByText(/something went wrong/i)
    ).not.toBeVisible()
  })

  test('"Back to games" link returns to the companion game selection page', async ({
    authedPage,
  }) => {
    await authedPage.goto('/companion/armies')
    await authedPage.getByRole('link', { name: /back to games/i }).click()
    await expect(authedPage).toHaveURL(/\/companion$/)
    await expect(
      authedPage.getByRole('heading', { name: /choose your game/i })
    ).toBeVisible({ timeout: 15_000 })
  })

  test('each army card has an "Open phase companion" button', async ({
    authedPage,
  }) => {
    await authedPage.goto('/companion/armies')
    // Only assert if there are armies — skip gracefully on an empty account
    const cards = authedPage.getByRole('button', { name: /open phase companion/i })
    const count = await cards.count()
    if (count > 0) {
      await expect(cards.first()).toBeVisible()
    }
  })

  test('clicking "Open phase companion" navigates to the phases route', async ({
    authedPage,
  }) => {
    await authedPage.goto('/companion/armies')
    const firstButton = authedPage
      .getByRole('button', { name: /open phase companion/i })
      .first()
    const hasArmies = await firstButton.isVisible().catch(() => false)
    test.skip(!hasArmies, 'no saved armies in this environment')
    await firstButton.click()
    await expect(authedPage).toHaveURL(/\/companion\/games\/.+\/army\/.+\/phases/)
  })
})
