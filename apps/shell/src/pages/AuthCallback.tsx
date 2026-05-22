import { Link } from 'react-router-dom'
import { AuthCallback } from '@40kauspex/auth'

/**
 * The `/auth/callback` route.
 *
 * `oidc-client-ts` (via the shared `AuthProvider`) performs the
 * authorization-code exchange automatically. The `AuthCallback` component
 * from `@40kauspex/auth` watches that process: on success it redirects to
 * `/`; on failure it renders the error UI supplied here.
 */
export default function AuthCallbackPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 text-center">
      <AuthCallback
        pending={
          <p className="text-sm text-muted-foreground">Signing you in...</p>
        }
        renderError={(message) => (
          <div className="space-y-2">
            <p className="text-sm text-destructive">
              Sign-in failed: {message}
            </p>
            <Link to="/login" className="text-sm underline">
              Back to sign in
            </Link>
          </div>
        )}
      />
    </div>
  )
}
