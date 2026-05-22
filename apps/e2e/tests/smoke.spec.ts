import { test, expect } from '@playwright/test'

test.describe('smoke', () => {
  test('health API returns ok', async ({ request }) => {
    const apiUrl = process.env.API_URL
    test.skip(!apiUrl, 'API_URL not set')
    const res = await request.get(`${apiUrl}/health`)
    expect(res.status()).toBe(200)
    expect(await res.json()).toEqual({ status: 'ok' })
  })

  test('site loads', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveTitle(/Auspex|40K/i)
  })

  test('unauthenticated user is redirected to login', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveURL(/\/login/)
  })

  test('login page has Google sign-in button', async ({ page }) => {
    await page.goto('/login')
    await expect(
      page.getByRole('button', { name: /sign in with google/i }),
    ).toBeVisible()
  })
})
