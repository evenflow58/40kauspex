import React, { Suspense } from 'react'
import { Routes, Route, NavLink } from 'react-router-dom'
import { Button } from '@40kauspex/ui'
import { useAuth } from '@40kauspex/auth'
import { LogOut, RefreshCw } from 'lucide-react'

// The federated remotes. Only resolvable from a built remote at runtime;
// unit tests alias these imports to local stubs (see vitest.config.ts).
const HomeApp = React.lazy(() => import('mfe_home/App'))
const CompanionApp = React.lazy(() => import('mfe_companion/App'))

/** Shared styling for a top-nav link, with an active-route treatment. */
function navLinkClass({ isActive }: { isActive: boolean }): string {
  return (
    'text-sm font-medium transition-colors ' +
    (isActive
      ? 'text-foreground'
      : 'text-muted-foreground hover:text-foreground')
  )
}

/**
 * The protected main application surface, shown once `RequireAuth` passes.
 *
 * Holds the shell chrome (header with primary navigation + sign-out) and
 * routes between the federated micro-frontends:
 *
 *   /            mfe-home
 *   /companion*  mfe-companion (game selection, army builder, phase companion)
 *
 * Each remote is lazy-loaded inside a Suspense boundary.
 */
export default function MainLayout() {
  const { user, signOut } = useAuth()

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-8 py-6">
          <div className="flex items-center gap-8">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">
                40K Auspex
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">Shell</p>
            </div>
            <nav className="flex items-center gap-4">
              <NavLink to="/" end className={navLinkClass}>
                Home
              </NavLink>
              <NavLink to="/companion" className={navLinkClass}>
                Companion
              </NavLink>
            </nav>
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
          <Routes>
            {/* The companion remote owns every `/companion/*` path. */}
            <Route path="/companion/*" element={<CompanionApp />} />
            <Route path="*" element={<HomeApp />} />
          </Routes>
        </Suspense>
      </main>
    </div>
  )
}
