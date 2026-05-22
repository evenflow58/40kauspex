import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from './useAuth'

interface RequireAuthProps {
  children: ReactNode
}

/**
 * Route guard for protected areas of the shell.
 *
 * - When auth is not configured (local dev with placeholder config), renders
 *   children directly so the app is usable without a deployed Cognito pool.
 * - While the OIDC client is resolving session state, renders nothing to avoid
 *   a flash of the login page before a known-good session loads.
 * - Once resolved: unauthenticated → redirect to `/login`; authenticated →
 *   render children.
 */
export function RequireAuth({ children }: RequireAuthProps) {
  const { isLoading, isAuthenticated, isConfigured } = useAuth()

  if (!isConfigured) return <>{children}</>
  if (isLoading) return null
  if (!isAuthenticated) return <Navigate to="/login" replace />

  return <>{children}</>
}
