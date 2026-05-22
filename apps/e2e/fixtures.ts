import { test as base, expect, type Page } from '@playwright/test'
import * as fs from 'fs'
import { AUTH_FILE } from './global-setup'

export { expect }

type E2EFixtures = {
  /**
   * A Playwright `Page` pre-loaded with the Cognito test user's tokens in
   * sessionStorage. Uses `addInitScript` so the tokens are injected before
   * the React app initialises, making `react-oidc-context` see an existing
   * session without going through the OAuth redirect.
   */
  authedPage: Page
}

export const test = base.extend<E2EFixtures>({
  authedPage: async ({ page }: { page: Page }, use: (p: Page) => Promise<void>) => {
    if (fs.existsSync(AUTH_FILE)) {
      const { storageKey, user } = JSON.parse(
        fs.readFileSync(AUTH_FILE, 'utf-8'),
      ) as { storageKey: string; user: unknown }
      // Runs before the page's own scripts load — oidc-client-ts reads
      // sessionStorage synchronously during initialisation.
      await page.addInitScript(
        ({ key, value }: { key: string; value: string }) => {
          sessionStorage.setItem(key, value)
        },
        { key: storageKey, value: JSON.stringify(user) },
      )
    }
    await use(page)
  },
})
