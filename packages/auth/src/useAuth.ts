import { useAuth as useOidcAuth } from 'react-oidc-context'
import type { AuthState, AuthUser } from './types'

/**
 * Normalise the `react-oidc-context` user object into the app's `AuthUser`.
 * Cognito ID-token profile claims are standard OIDC claims regardless of the
 * upstream provider.
 */
function toAuthUser(profile: Record<string, unknown> | undefined): AuthUser | null {
  if (!profile) {
    return null
  }
  const sub = profile.sub
  if (typeof sub !== 'string') {
    return null
  }
  const asString = (value: unknown): string | null =>
    typeof value === 'string' ? value : null
  return {
    id: sub,
    email: asString(profile.email),
    name: asString(profile.name),
    picture: asString(profile.picture),
  }
}

/**
 * Auth hook for the 40K Auspex shell and any federated MFE.
 *
 * Wraps `react-oidc-context`'s `useAuth` and exposes a small, stable,
 * provider-agnostic surface. Because `@40kauspex/auth` is a Module Federation
 * shared singleton, `mfe-home` calling this hook reads the SAME session the
 * shell established.
 */
export function useAuth(): AuthState {
  const oidc = useOidcAuth()

  /** Begin the Authorization Code + PKCE flow, forced straight to Google. */
  const signIn = (): void => {
    void oidc.signinRedirect({
      // Skip the Cognito-branded chooser and hand off directly to Google.
      extraQueryParams: { identity_provider: 'Google' },
    })
  }

  /**
   * End the session. Clears the local tokens then redirects to Cognito's
   * Hosted UI `/logout` endpoint, which clears the Cognito session cookie
   * and returns the browser to the post-logout URI.
   *
   * Cognito's `/logout` uses non-standard query params (`client_id` +
   * `logout_uri`), so the redirect is built explicitly rather than via
   * `signoutRedirect`.
   */
  const signOut = (): void => {
    const settings = oidc.settings
    const endSessionEndpoint = settings.metadata?.end_session_endpoint
    const logoutUri = settings.post_logout_redirect_uri
    void oidc.removeUser().finally(() => {
      if (endSessionEndpoint && logoutUri) {
        const url = new URL(endSessionEndpoint)
        url.searchParams.set('client_id', settings.client_id)
        url.searchParams.set('logout_uri', logoutUri)
        window.location.assign(url.toString())
      }
    })
  }

  return {
    isLoading: oidc.isLoading,
    isAuthenticated: oidc.isAuthenticated,
    user: toAuthUser(oidc.user?.profile),
    accessToken: oidc.user?.access_token ?? null,
    signIn,
    signOut,
  }
}
