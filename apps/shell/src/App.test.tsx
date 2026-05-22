import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

// The shell lazy-loads the federated remote `mfe_home/App`, which is only
// resolvable from a built remote at runtime. `vitest.config.ts` aliases that
// import to `src/test/mfe-home-stub.tsx` so the shell can be unit-tested in
// isolation; the stub renders an element with data-testid="remote-home".
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

  it('eventually renders the federated remote inside the Suspense boundary', async () => {
    renderApp('/')
    // React.lazy resolves asynchronously; findBy* waits for it.
    expect(await screen.findByTestId('remote-home')).toBeInTheDocument()
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
