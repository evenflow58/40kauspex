import { useEffect, useState, useCallback } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@40kauspex/ui'
import { useAuth } from '@40kauspex/auth'
import { companionApi } from '../api'
import type { ArmySummary } from '../types'
import { LoadingView, ErrorView } from '../components/StatusViews'

/** Locale-aware "May 20, 2026"-style formatter for army timestamps. */
const dateFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
})

/** Safely format an ISO timestamp — fall back to the raw value on parse error. */
function formatDate(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return dateFormatter.format(date)
}

/**
 * My Armies page (`/companion/armies`).
 *
 * Lists the signed-in user's saved armies, most-recently-updated first.
 * Each card links to that army's phase companion. When the user has no
 * armies yet, an empty state prompts them to build one.
 */
export default function MyArmiesPage() {
  const navigate = useNavigate()
  const { accessToken } = useAuth()

  const [armies, setArmies] = useState<ArmySummary[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [retryCount, setRetryCount] = useState(0)
  const retry = useCallback(() => setRetryCount((c) => c + 1), [])

  useEffect(() => {
    let cancelled = false
    setError(null)
    setArmies(null)
    companionApi
      .listArmies(accessToken)
      .then((list) => {
        if (cancelled) return
        // Most recently updated first — what the user is likeliest to return to.
        const sorted = [...list].sort((a, b) =>
          b.updatedAt.localeCompare(a.updatedAt)
        )
        setArmies(sorted)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : 'Failed to load armies')
      })
    return () => {
      cancelled = true
    }
  }, [accessToken, retryCount])

  return (
    <section className="space-y-6">
      <div>
        <Button variant="link" asChild className="px-0">
          <Link to="/companion">&larr; Back to games</Link>
        </Button>
        <h2 className="text-2xl font-semibold tracking-tight">My Armies</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Pick up where you left off — open an army's phase companion.
        </p>
      </div>

      {error && <ErrorView message={error} onRetry={retry} />}
      {!error && !armies && <LoadingView label="Loading your armies…" />}

      {armies && armies.length === 0 && (
        <Card className="mx-auto max-w-md">
          <CardContent className="space-y-3 p-6 text-center">
            <p className="text-base font-medium">No armies yet</p>
            <p className="text-sm text-muted-foreground">
              Build your first army to start using the phase companion.
            </p>
            <Button asChild>
              <Link to="/companion">Build an army</Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {armies && armies.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2">
          {armies.map((army) => (
            <Card key={army.armyId}>
              <CardHeader>
                <CardTitle>{army.name}</CardTitle>
                <CardDescription>{army.factionName}</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground">
                  Updated {formatDate(army.updatedAt)}
                </p>
              </CardContent>
              <CardFooter>
                <Button
                  aria-label={`Open phase companion for ${army.name}`}
                  onClick={() =>
                    navigate(
                      `/companion/games/${army.gameId}/army/${army.armyId}/phases`
                    )
                  }
                >
                  Open phase companion
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}
    </section>
  )
}
