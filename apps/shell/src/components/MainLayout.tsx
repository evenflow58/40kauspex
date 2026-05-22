import React, { Suspense } from 'react'
import { Button } from '@40kauspex/ui'
import { useAuth } from '@40kauspex/auth'
import { LogOut, RefreshCw } from 'lucide-react'

// The federated remote. Only resolvable from a built remote at runtime;
// unit tests alias `mfe_home/App` to a local stub (see vitest.config.ts).
const HomeApp = React.lazy(() => import('mfe_home/App'))

/**
 * The protected main application surface, shown once `RequireAuth` passes.
 *
 * Holds the shell chrome (header with the signed-in user + sign-out) and
 * lazy-loads the federated `mfe-home` remote inside a Suspense boundary.
 */
export default function MainLayout() {
  const { user, signOut } = useAuth()

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-8 py-6">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              40K Auspex
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">Shell</p>
          </div>
          <div className="flex items-center gap-4">
            {user && (
              <span className="text-sm text-muted-foreground">
                {user.name ?? user.email}
              </span>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => window.location.reload()}
            >
              <RefreshCw />
              Refresh
            </Button>
            <Button variant="ghost" size="sm" onClick={signOut}>
              <LogOut />
              Sign out
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-8 py-8">
        <Suspense
          fallback={
            <p className="text-sm text-muted-foreground">Loading remote...</p>
          }
        >
          <HomeApp />
        </Suspense>
      </main>
    </div>
  )
}
