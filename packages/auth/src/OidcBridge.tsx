import { type ReactNode, useMemo } from 'react'
import { useAuth as useOidcAuth } from 'react-oidc-context'
import { AuthContext } from './context'
import type { AuthState, AuthUser } from './types'

function toAuthUser(profile: Record<string, unknown> | undefined): AuthUser | null {
  if (!profile) return null
  const sub = profile.sub
  if (typeof sub !== 'string') return null
  const asString = (v: unknown): string | null => (typeof v === 'string' ? v : null)
  return {
    id: sub,
    email: asString(profile.email),
    name: asString(profile.name),
    picture: asString(profile.picture),
  }
}

/**
 * Must be rendered inside `react-oidc-context`'s `AuthProvider`.
 * Reads the OIDC session and publishes it to `AuthContext` so all
 * auth-aware code consumes one stable context regardless of provider.
 */
export function OidcBridge({ children }: { children: ReactNode }) {
  const oidc = useOidcAuth()

  const signIn = (): void => {
    void oidc.signinRedirect({ extraQueryParams: { identity_provider: 'Google' } })
  }

  const signOut = (): void => {
    const { settings } = oidc
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

  const value: AuthState = useMemo(
    () => ({
      isLoading: oidc.isLoading,
      isAuthenticated: oidc.isAuthenticated,
      isConfigured: true,
      user: toAuthUser(oidc.user?.profile),
      accessToken: oidc.user?.access_token ?? null,
      signIn,
      signOut,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [oidc.isLoading, oidc.isAuthenticated, oidc.user],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
