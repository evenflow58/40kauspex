// @40kauspex/auth — authentication for the 40K Auspex shell and MFEs.
//
// Wraps `oidc-client-ts` + `react-oidc-context` against a Cognito User Pool
// (Google IdP). Declared as a Module Federation shared singleton so the shell
// and every federated MFE share one auth context.

export { AuthProvider } from './AuthProvider'
export { useAuth } from './useAuth'
export { RequireAuth } from './RequireAuth'
export { AuthCallback } from './AuthCallback'

export type { AuthConfig, AuthUser, AuthState } from './types'
