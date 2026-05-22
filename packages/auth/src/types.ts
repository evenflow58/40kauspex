/**
 * Runtime auth configuration, fetched from `/auth-config.json` at shell
 * startup. The values are environment-specific (production vs. each PR env)
 * and are written to the S3 site root by the deploy step from CDK outputs.
 *
 * None of these values are secrets — a SPA client id and a Cognito pool id
 * are public identifiers.
 */
export interface AuthConfig {
  /** Cognito User Pool ID, e.g. `us-east-1_xxxxxxxxx`. */
  userPoolId: string
  /** Cognito app client ID (public SPA client, no secret). */
  clientId: string
  /** Cognito Hosted UI base URL (OAuth authorize/token/logout endpoints). */
  cognitoDomain: string
  /** OAuth redirect URI — the shell's `/auth/callback` route. */
  redirectUri: string
  /** Post-logout redirect URI — the shell's root. */
  postLogoutRedirectUri: string
  /** OAuth scopes requested at sign-in. */
  scopes: string[]
}

/**
 * The authenticated user, normalised from the Cognito ID-token claims.
 * Identical shape regardless of the upstream identity provider (Google today,
 * more later) because Cognito normalises every provider into the same JWT.
 */
export interface AuthUser {
  /** Stable subject identifier (`sub` claim). */
  id: string
  /** Email address, if present in the token. */
  email: string | null
  /** Display name, if present in the token. */
  name: string | null
  /** Profile picture URL, if present in the token. */
  picture: string | null
}

/** The surface exposed by the `useAuth` hook. */
export interface AuthState {
  /** True while the OIDC client is resolving session state. */
  isLoading: boolean
  /** True once a valid session exists. */
  isAuthenticated: boolean
  /** The signed-in user, or `null` when unauthenticated. */
  user: AuthUser | null
  /** Cognito access token for future API Gateway calls, or `null`. */
  accessToken: string | null
  /** Begin the Authorization Code + PKCE flow via Cognito -> Google. */
  signIn: () => void
  /** Clear the local session and end the Cognito session. */
  signOut: () => void
}
