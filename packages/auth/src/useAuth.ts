import { useAuthContext } from './context'
import type { AuthState } from './types'

/**
 * Auth hook for the 40K Auspex shell and any federated MFE.
 *
 * Reads from `AuthContext`, which is populated by `OidcBridge` (configured
 * environments) or a stub (local dev with placeholder config). Because
 * `@40kauspex/auth` is a Module Federation shared singleton, `mfe-home`
 * calling this hook reads the SAME session the shell established.
 */
export function useAuth(): AuthState {
  return useAuthContext()
}
