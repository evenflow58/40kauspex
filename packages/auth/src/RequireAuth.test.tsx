import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { RequireAuth } from './RequireAuth'
import { AuthContext } from './context'
import type { AuthState } from './types'

const baseState: AuthState = {
  isLoading: false,
  isAuthenticated: false,
  isConfigured: true,
  user: null,
  accessToken: null,
  signIn: () => {},
  signOut: () => {},
}

function renderGuarded(state: Partial<AuthState> = {}) {
  return render(
    <AuthContext.Provider value={{ ...baseState, ...state }}>
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
    </AuthContext.Provider>,
  )
}

describe('RequireAuth', () => {
  it('redirects an unauthenticated user to /login', () => {
    renderGuarded({ isAuthenticated: false })
    expect(screen.getByTestId('login')).toBeInTheDocument()
    expect(screen.queryByTestId('protected')).not.toBeInTheDocument()
  })

  it('renders the protected children for an authenticated user', () => {
    renderGuarded({ isAuthenticated: true })
    expect(screen.getByTestId('protected')).toBeInTheDocument()
    expect(screen.queryByTestId('login')).not.toBeInTheDocument()
  })

  it('renders nothing while auth state is still loading', () => {
    renderGuarded({ isLoading: true })
    expect(screen.queryByTestId('protected')).not.toBeInTheDocument()
    expect(screen.queryByTestId('login')).not.toBeInTheDocument()
  })

  it('bypasses the guard when auth is not configured (local dev)', () => {
    renderGuarded({ isConfigured: false, isAuthenticated: false })
    expect(screen.getByTestId('protected')).toBeInTheDocument()
    expect(screen.queryByTestId('login')).not.toBeInTheDocument()
  })
})
