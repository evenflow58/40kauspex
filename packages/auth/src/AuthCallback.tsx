import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth as useOidcAuth } from 'react-oidc-context'

interface AuthCallbackProps {
  /**
   * Rendered while `oidc-client-ts` completes the authorization-code
   * exchange. Defaults to nothing.
   */
  pending?: React.ReactNode
  /** Rendered if the exchange fails. Receives the error message. */
  renderError?: (message: string) => React.ReactNode
}

/**
 * Handles the `/auth/callback` route.
 *
 * The `react-oidc-context` provider performs the code-for-token exchange
 * automatically when it detects the `?code=&state=` params in the URL. This
 * component only watches that process: on success it navigates to `/`; on
 * failure it surfaces the error. It must be mounted OUTSIDE `RequireAuth`.
 */
export function AuthCallback({ pending, renderError }: AuthCallbackProps) {
  const { isLoading, isAuthenticated, error } = useOidcAuth()
  const navigate = useNavigate()

  useEffect(() => {
    // Once the exchange has resolved into a session, leave the callback route.
    if (!isLoading && isAuthenticated) {
      navigate('/', { replace: true })
    }
  }, [isLoading, isAuthenticated, navigate])

  if (error) {
    return <>{renderError?.(error.message) ?? null}</>
  }

  return <>{pending ?? null}</>
}
