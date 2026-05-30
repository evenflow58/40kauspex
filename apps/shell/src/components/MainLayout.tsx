import React, { Suspense } from 'react'
import { Routes, Route } from 'react-router-dom'
import { Button } from '@40kauspex/ui'
import { useAuth } from '@40kauspex/auth'
import { LogOut, RefreshCw } from 'lucide-react'
import Nav from './Nav'

// The federated remotes. Only resolvable from a built remote at runtime;
// unit tests alias these imports to local stubs (see vitest.config.ts).
const HomeApp = React.lazy(() => import('mfe_home/App'))
const CompanionApp = React.lazy(() => import('mfe_companion/App'))

function RemoteLoading() {
  return <p className="text-sm text-muted-foreground">Loading remote...</p>
}

// Remotes share the shell's <BrowserRouter> via the react-router-dom singleton
// (vite.config.ts) — without this, nested <Routes> inside a remote would use
// a different router context and path matching would break.
export default function MainLayout() {
  const { user, signOut } = useAuth()

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-6 sm:px-8">
          <div className="flex items-center gap-6">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">
                40K Auspex
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">Shell</p>
            </div>
            <Nav />
          </div>
          <div className="flex items-center gap-4">
            {user && (
              <span className="hidden text-sm text-muted-foreground sm:inline">
                {user.name ?? user.email}
              </span>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => window.location.reload()}
            >
              <RefreshCw />
              <span className="sr-only sm:not-sr-only">Refresh</span>
            </Button>
            <Button variant="ghost" size="sm" onClick={signOut}>
              <LogOut />
              <span className="sr-only sm:not-sr-only">Sign out</span>
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-8">
        <Suspense fallback={<RemoteLoading />}>
          <Routes>
            <Route index element={<HomeApp />} />
            <Route path="companion/*" element={<CompanionApp />} />
          </Routes>
        </Suspense>
      </main>
    </div>
  )
}
