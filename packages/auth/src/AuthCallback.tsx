import { useEffect } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useAuth as useOidcAuth } from 'react-oidc-context'
import { useAuth } from './useAuth'

interface AuthCallbackProps {
  pending?: React.ReactNode
  renderError?: (message: string) => React.ReactNode
}

/**
 * Inner callback handler — only rendered when inside the OIDC provider
 * (i.e. auth is configured). Watches the code-exchange and navigates to `/`
 * on success.
 */
function OidcCallbackInner({ pending, renderError }: AuthCallbackProps) {
  const { isLoading, isAuthenticated, error } = useOidcAuth()
  const navigate = useNavigate()

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      navigate('/', { replace: true })
    }
  }, [isLoading, isAuthenticated, navigate])

  if (error) return <>{renderError?.(error.message) ?? null}</>
  return <>{pending ?? null}</>
}

/**
 * Handles the `/auth/callback` route.
 *
 * When auth is not configured (local dev), redirects straight to `/` so an
 * accidental navigation here doesn't crash. When configured, delegates to
 * `OidcCallbackInner` which safely calls `useOidcAuth()` inside its provider.
 */
export function AuthCallback(props: AuthCallbackProps) {
  const { isConfigured } = useAuth()

  if (!isConfigured) return <Navigate to="/" replace />

  return <OidcCallbackInner {...props} />
}
