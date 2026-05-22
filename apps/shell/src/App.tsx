import React, { Suspense } from 'react'
import { Button } from '@40kauspex/ui'
import { RefreshCw } from 'lucide-react'

const HomeApp = React.lazy(() => import('mfe_home/App'))

export default function App() {
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
          <Button
            variant="ghost"
            size="sm"
            onClick={() => window.location.reload()}
          >
            <RefreshCw />
            Refresh
          </Button>
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
