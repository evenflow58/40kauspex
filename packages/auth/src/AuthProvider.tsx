import { useEffect, useState, type ReactNode } from 'react'
import { AuthProvider as OidcAuthProvider } from 'react-oidc-context'
import { WebStorageStateStore, type UserManagerSettings } from 'oidc-client-ts'
import { AuthContext } from './context'
import { OidcBridge } from './OidcBridge'
import type { AuthConfig, AuthState } from './types'

const AUTH_CONFIG_URL = '/auth-config.json'

function buildOidcSettings(config: AuthConfig): UserManagerSettings {
  const domain = config.cognitoDomain.replace(/\/$/, '')
  const region = config.userPoolId.split('_')[0]
  const issuer = `https://cognito-idp.${region}.amazonaws.com/${config.userPoolId}`
  return {
    authority: issuer,
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    post_logout_redirect_uri: config.postLogoutRedirectUri,
    response_type: 'code',
    scope: config.scopes.join(' '),
    metadata: {
      issuer,
      authorization_endpoint: `${domain}/oauth2/authorize`,
      token_endpoint: `${domain}/oauth2/token`,
      userinfo_endpoint: `${domain}/oauth2/userInfo`,
      end_session_endpoint: `${domain}/logout`,
      jwks_uri: `${issuer}/.well-known/jwks.json`,
    },
    // sessionStorage: cleared on tab close, not shared across tabs. Preferred
    // over localStorage for tokens — move to HttpOnly cookies (BFF) when the
    // API tier lands.
    userStore: new WebStorageStateStore({ store: window.sessionStorage }),
  }
}

function onSigninCallback(): void {
  window.history.replaceState({}, document.title, window.location.pathname)
}

/** Stub state served when `auth-config.json` has placeholder values (local dev). */
const UNCONFIGURED_STATE: AuthState = {
  isLoading: false,
  isAuthenticated: false,
  isConfigured: false,
  user: null,
  accessToken: null,
  signIn: () => {
    console.warn(
      '[auth] Auth is not configured for local development. ' +
        'Deploy AuthCoreStack and update auth-config.json to enable login.',
    )
  },
  signOut: () => {},
}

interface AuthProviderProps {
  children: ReactNode
}

/**
 * Top-level auth provider for the 40K Auspex shell.
 *
 * Fetches `/auth-config.json` at mount and initialises the OIDC client.
 * When the config contains placeholder values (local dev without a deployed
 * Cognito pool) it renders a stub auth context so the app works without
 * crashing or redirecting to a non-existent Cognito domain.
 */
export function AuthProvider({ children }: AuthProviderProps) {
  const [config, setConfig] = useState<AuthConfig | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    fetch(AUTH_CONFIG_URL, { cache: 'no-store' })
      .then((res) => {
        if (!res.ok) throw new Error(`auth-config.json responded ${res.status}`)
        return res.json() as Promise<AuthConfig>
      })
      .then((cfg) => {
        if (!cancelled) setConfig(cfg)
      })
      .catch((err: unknown) => {
        if (!cancelled)
          setError(err instanceof Error ? err.message : 'Failed to load auth config')
      })

    return () => {
      cancelled = true
    }
  }, [])

  if (error) {
    return (
      <div role="alert" style={{ padding: '2rem', textAlign: 'center' }}>
        Unable to start authentication: {error}
      </div>
    )
  }

  if (!config) return null

  // Local dev: placeholder config — skip OIDC entirely to avoid redirects to
  // a non-existent Cognito domain.
  if (config.clientId === 'PLACEHOLDER') {
    return (
      <AuthContext.Provider value={UNCONFIGURED_STATE}>
        {children}
      </AuthContext.Provider>
    )
  }

  return (
    <OidcAuthProvider {...buildOidcSettings(config)} onSigninCallback={onSigninCallback}>
      <OidcBridge>{children}</OidcBridge>
    </OidcAuthProvider>
  )
}
