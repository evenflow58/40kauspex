import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { AuthCallback } from './AuthCallback'
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

// Mock react-oidc-context so OidcCallbackInner works without a real provider.
vi.mock('react-oidc-context', () => ({
  useAuth: () => ({ isLoading: false, isAuthenticated: false, error: undefined }),
}))

function renderCallback(state: Partial<AuthState> = {}, path = '/auth/callback') {
  return render(
    <AuthContext.Provider value={{ ...baseState, ...state }}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/auth/callback" element={<AuthCallback pending={<div data-testid="pending">Loading…</div>} />} />
          <Route path="/" element={<div data-testid="home">Home</div>} />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  )
}

describe('AuthCallback', () => {
  it('redirects to / when auth is not configured (local dev)', () => {
    renderCallback({ isConfigured: false })
    expect(screen.getByTestId('home')).toBeInTheDocument()
    expect(screen.queryByTestId('pending')).not.toBeInTheDocument()
  })

  it('renders the pending slot while the code exchange is in progress', () => {
    renderCallback({ isConfigured: true })
    expect(screen.getByTestId('pending')).toBeInTheDocument()
  })

  it('renders nothing when no pending slot is provided', () => {
    render(
      <AuthContext.Provider value={{ ...baseState, isConfigured: true }}>
        <MemoryRouter initialEntries={['/auth/callback']}>
          <Routes>
            <Route path="/auth/callback" element={<AuthCallback />} />
          </Routes>
        </MemoryRouter>
      </AuthContext.Provider>,
    )
    // No crash, nothing rendered
    expect(screen.queryByTestId('pending')).not.toBeInTheDocument()
  })
})
