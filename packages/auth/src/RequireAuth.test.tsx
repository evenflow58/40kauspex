import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { RequireAuth } from './RequireAuth'

// `RequireAuth` reads session state via `useAuth`, which wraps
// `react-oidc-context`'s `useAuth`. Mock the underlying library hook so each
// test can pin a specific auth state without a real OIDC provider.
const oidcState = {
  isLoading: false,
  isAuthenticated: false,
}

vi.mock('react-oidc-context', () => ({
  useAuth: () => ({
    ...oidcState,
    user: undefined,
    settings: {},
    signinRedirect: vi.fn(),
    removeUser: vi.fn(),
  }),
}))

function renderGuarded() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route
          path="/"
          element={
            <RequireAuth>
              <div data-testid="protected">Secret content</div>
            </RequireAuth>
          }
        />
        <Route path="/login" element={<div data-testid="login">Login</div>} />
      </Routes>
    </MemoryRouter>
  )
}

describe('RequireAuth', () => {
  beforeEach(() => {
    oidcState.isLoading = false
    oidcState.isAuthenticated = false
  })

  it('redirects an unauthenticated user to /login', () => {
    oidcState.isAuthenticated = false
    renderGuarded()
    expect(screen.getByTestId('login')).toBeInTheDocument()
    expect(screen.queryByTestId('protected')).not.toBeInTheDocument()
  })

  it('renders the protected children for an authenticated user', () => {
    oidcState.isAuthenticated = true
    renderGuarded()
    expect(screen.getByTestId('protected')).toBeInTheDocument()
    expect(screen.queryByTestId('login')).not.toBeInTheDocument()
  })

  it('renders nothing while auth state is still loading', () => {
    oidcState.isLoading = true
    renderGuarded()
    expect(screen.queryByTestId('protected')).not.toBeInTheDocument()
    expect(screen.queryByTestId('login')).not.toBeInTheDocument()
  })
})
