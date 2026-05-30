import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

// The shell lazy-loads the federated remotes `mfe_home/App` and
// `mfe_companion/App`, which are only resolvable from a built remote at
// runtime. `vitest.config.ts` aliases each import to a local stub so the shell
// can be unit-tested in isolation; the stubs render elements with
// `data-testid="remote-home"` and `data-testid="remote-companion"`.
//
// `App` also depends on `@40kauspex/auth` for `AuthProvider` (fetches
// auth-config.json over the network) and `RequireAuth` (gates routes). Both
// are mocked so routing is tested without a real OIDC provider: `AuthProvider`
// is a passthrough and `RequireAuth` honours the controllable `authState`.
import type { ReactNode } from 'react'

const authState = {
  isLoading: false,
  isAuthenticated: true,
}

vi.mock('@40kauspex/auth', () => ({
  AuthProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  RequireAuth: ({ children }: { children: ReactNode }) => {
    if (authState.isLoading) return null
    if (!authState.isAuthenticated) return <div data-testid="redirected-login" />
    return <>{children}</>
  },
  useAuth: () => ({
    isLoading: authState.isLoading,
    isAuthenticated: authState.isAuthenticated,
    user: { id: 'u1', email: 'pilot@40kauspex.test', name: 'Test Pilot', picture: null },
    accessToken: 'token',
    signIn: vi.fn(),
    signOut: vi.fn(),
  }),
}))

import App from './App'

function renderApp(initialPath = '/') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <App />
    </MemoryRouter>
  )
}

describe('shell App', () => {
  beforeEach(() => {
    authState.isLoading = false
    authState.isAuthenticated = true
  })

  it('renders the main layout for an authenticated user at /', () => {
    renderApp('/')
    expect(
      screen.getByRole('heading', { name: '40K Auspex' })
    ).toBeInTheDocument()
  })

  it('renders the app title in the header', () => {
    renderApp('/')
    const heading = screen.getByRole('heading', { name: '40K Auspex' })
    expect(heading.tagName).toBe('H1')
  })

  it('renders the Refresh button in the protected layout', () => {
    renderApp('/')
    expect(
      screen.getByRole('button', { name: /refresh/i })
    ).toBeInTheDocument()
  })

  it('renders a Sign out button in the protected layout', () => {
    renderApp('/')
    expect(
      screen.getByRole('button', { name: /sign out/i })
    ).toBeInTheDocument()
  })

  it('renders the primary nav with Home and Companion links', () => {
    renderApp('/')
    const nav = screen.getByRole('navigation', { name: /primary/i })
    expect(nav).toBeInTheDocument()
    // sr-only labels are still queryable by accessible name.
    expect(screen.getByRole('link', { name: /home/i })).toHaveAttribute(
      'href',
      '/'
    )
    expect(screen.getByRole('link', { name: /companion/i })).toHaveAttribute(
      'href',
      '/companion'
    )
  })

  it('marks the Home link as the current page at /', () => {
    renderApp('/')
    const homeLink = screen.getByRole('link', { name: /home/i })
    expect(homeLink).toHaveAttribute('aria-current', 'page')
    const companionLink = screen.getByRole('link', { name: /companion/i })
    expect(companionLink).not.toHaveAttribute('aria-current', 'page')
  })

  it('marks the Companion link as the current page under /companion', () => {
    renderApp('/companion')
    const companionLink = screen.getByRole('link', { name: /companion/i })
    expect(companionLink).toHaveAttribute('aria-current', 'page')
    const homeLink = screen.getByRole('link', { name: /home/i })
    expect(homeLink).not.toHaveAttribute('aria-current', 'page')
  })

  it('eventually renders the federated home remote at /', async () => {
    renderApp('/')
    expect(await screen.findByTestId('remote-home')).toBeInTheDocument()
  })

  it('eventually renders the federated companion remote at /companion', async () => {
    renderApp('/companion')
    expect(await screen.findByTestId('remote-companion')).toBeInTheDocument()
  })

  it('keeps rendering the companion remote at a nested /companion path', async () => {
    renderApp('/companion/games/warhammer-40k/army')
    expect(await screen.findByTestId('remote-companion')).toBeInTheDocument()
  })

  it('renders the login page on the /login route for an unauthenticated user', () => {
    // An authenticated user is bounced off /login by LoginPage's own guard,
    // so this route assertion uses the unauthenticated state.
    authState.isAuthenticated = false
    renderApp('/login')
    expect(
      screen.getByRole('button', { name: /sign in with google/i })
    ).toBeInTheDocument()
  })

  it('gates the main layout when the user is not authenticated', () => {
    authState.isAuthenticated = false
    renderApp('/')
    expect(screen.getByTestId('redirected-login')).toBeInTheDocument()
    expect(
      screen.queryByRole('heading', { name: '40K Auspex' })
    ).not.toBeInTheDocument()
  })
})
