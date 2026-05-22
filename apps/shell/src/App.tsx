import { Routes, Route } from 'react-router-dom'
import { AuthProvider, RequireAuth } from '@40kauspex/auth'
import LoginPage from './pages/LoginPage'
import AuthCallbackPage from './pages/AuthCallback'
import MainLayout from './components/MainLayout'

/**
 * Shell root.
 *
 * `AuthProvider` (from `@40kauspex/auth`) fetches the runtime
 * `auth-config.json` and supplies the OIDC context. Routing:
 *
 *   /login          public branded login page
 *   /auth/callback  public OAuth code-exchange handler (outside the guard)
 *   /* (everything)  protected — `RequireAuth` gates the main app
 */
export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/auth/callback" element={<AuthCallbackPage />} />
        <Route
          path="/*"
          element={
            <RequireAuth>
              <MainLayout />
            </RequireAuth>
          }
        />
      </Routes>
    </AuthProvider>
  )
}
