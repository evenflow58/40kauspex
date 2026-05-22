import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import LoginPage from './LoginPage'

// The login page calls `signIn()` from `@40kauspex/auth`'s `useAuth`. Mock the
// whole package so the test runs without a real OIDC provider or auth-config.
const signIn = vi.fn()
const authState = {
  isLoading: false,
  isAuthenticated: false,
  isConfigured: true,
}

vi.mock('@40kauspex/auth', () => ({
  useAuth: () => ({
    ...authState,
    user: null,
    accessToken: null,
    signIn,
    signOut: vi.fn(),
  }),
}))

function renderLoginPage() {
  return render(
    <MemoryRouter initialEntries={['/login']}>
      <LoginPage />
    </MemoryRouter>
  )
}

describe('LoginPage', () => {
  beforeEach(() => {
    signIn.mockClear()
    authState.isLoading = false
    authState.isAuthenticated = false
    authState.isConfigured = true
  })

  it('renders the branded title and description', () => {
    renderLoginPage()
    expect(
      screen.getByRole('heading', { name: '40K Auspex' })
    ).toBeInTheDocument()
    expect(
      screen.getByText(/sign in to access your command console/i)
    ).toBeInTheDocument()
  })

  it('renders the "Sign in with Google" button', () => {
    renderLoginPage()
    expect(
      screen.getByRole('button', { name: /sign in with google/i })
    ).toBeInTheDocument()
  })

  it('calls signIn when the Google button is clicked', async () => {
    const user = userEvent.setup()
    renderLoginPage()
    await user.click(
      screen.getByRole('button', { name: /sign in with google/i })
    )
    expect(signIn).toHaveBeenCalledTimes(1)
  })
})
