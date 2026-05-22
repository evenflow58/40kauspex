import { createContext, useContext } from 'react'
import type { AuthState } from './types'

/**
 * Shared auth state context. Populated either by `OidcBridge` (configured)
 * or directly by `AuthProvider` with a stub (PLACEHOLDER / local dev).
 *
 * Consuming via `useAuthContext` instead of `react-oidc-context`'s `useAuth`
 * means all auth-aware code works identically in both configured and
 * unconfigured environments.
 */
export const AuthContext = createContext<AuthState>({
  isLoading: true,
  isAuthenticated: false,
  isConfigured: true,
  user: null,
  accessToken: null,
  signIn: () => {},
  signOut: () => {},
})

export function useAuthContext(): AuthState {
  return useContext(AuthContext)
}
