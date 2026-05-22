import { useEffect, useState, type ReactNode } from 'react'
import { AuthProvider as OidcAuthProvider } from 'react-oidc-context'
import { WebStorageStateStore, type UserManagerSettings } from 'oidc-client-ts'
import type { AuthConfig } from './types'

/** Where the runtime auth configuration is served from. */
const AUTH_CONFIG_URL = '/auth-config.json'

/**
 * Build the `oidc-client-ts` settings for a Cognito User Pool from the
 * runtime `auth-config.json`.
 *
 * Cognito's OIDC discovery document advertises the `cognito-idp.*` issuer
 * endpoints, NOT the Hosted UI OAuth endpoints used for the federated
 * (Google) flow. The Hosted UI endpoints are therefore supplied explicitly
 * as `metadata` so `oidc-client-ts` hits `{cognitoDomain}/oauth2/*` directly
 * and no discovery round-trip is needed.
 */
function buildOidcSettings(config: AuthConfig): UserManagerSettings {
  const domain = config.cognitoDomain.replace(/\/$/, '')
  // A Cognito User Pool ID is `<region>_<suffix>`, so the region is the
  // segment before the first underscore — no separate config value needed.
  const region = config.userPoolId.split('_')[0]
  const issuer = `https://cognito-idp.${region}.amazonaws.com/${config.userPoolId}`
  return {
    // The token issuer is the User Pool itself (used to validate `iss`).
    authority: issuer,
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    post_logout_redirect_uri: config.postLogoutRedirectUri,
    response_type: 'code',
    scope: config.scopes.join(' '),
    // Explicit Hosted UI endpoints — see the doc comment above.
    metadata: {
      issuer,
      authorization_endpoint: `${domain}/oauth2/authorize`,
      token_endpoint: `${domain}/oauth2/token`,
      userinfo_endpoint: `${domain}/oauth2/userInfo`,
      end_session_endpoint: `${domain}/logout`,
      jwks_uri: `${issuer}/.well-known/jwks.json`,
    },
    // Tokens persist in sessionStorage so a tab refresh keeps the session;
    // they are cleared when the tab closes.
    userStore: new WebStorageStateStore({ store: window.sessionStorage }),
  }
}

/**
 * Strip the `?code=&state=` query params from the URL once the callback has
 * been processed, so a refresh of `/auth/callback` does not re-trigger it.
 * Supplied to `react-oidc-context`'s `AuthProvider` (not part of the
 * `oidc-client-ts` `UserManagerSettings`).
 */
function onSigninCallback(): void {
  window.history.replaceState({}, document.title, window.location.pathname)
}

interface AuthProviderProps {
  children: ReactNode
}

/**
 * Top-level auth provider for the 40K Auspex shell.
 *
 * Fetches the environment's `auth-config.json` at mount, builds the
 * `oidc-client-ts` settings, and renders the `react-oidc-context` provider.
 * While the config is in flight nothing is rendered; if the fetch fails an
 * inline error is shown (login cannot proceed without it).
 *
 * Declared as a Module Federation shared singleton so the federated
 * `mfe-home` reads the SAME auth context the shell establishes.
 */
export function AuthProvider({ children }: AuthProviderProps) {
  const [settings, setSettings] = useState<UserManagerSettings | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    fetch(AUTH_CONFIG_URL, { cache: 'no-store' })
      .then((res) => {
        if (!res.ok) {
          throw new Error(`auth-config.json responded ${res.status}`)
        }
        return res.json() as Promise<AuthConfig>
      })
      .then((config) => {
        if (!cancelled) {
          setSettings(buildOidcSettings(config))
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : 'Failed to load auth config'
          )
        }
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

  // Render nothing until the runtime config has loaded.
  if (!settings) {
    return null
  }

  return (
    <OidcAuthProvider {...settings} onSigninCallback={onSigninCallback}>
      {children}
    </OidcAuthProvider>
  )
}
