import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from './useAuth'

interface RequireAuthProps {
  children: ReactNode
}

/**
 * Route guard for protected areas of the shell.
 *
 * - While the OIDC client is still resolving session state, renders nothing
 *   (avoids a flash of the login page before a known-good session loads).
 * - Once resolved: an unauthenticated user is redirected to `/login`; an
 *   authenticated user sees the protected `children`.
 *
 * The `/auth/callback` route must be mounted OUTSIDE this guard so the code
 * exchange can complete before the guard ever evaluates.
 */
export function RequireAuth({ children }: RequireAuthProps) {
  const { isLoading, isAuthenticated } = useAuth()

  if (isLoading) {
    return null
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  return <>{children}</>
}
