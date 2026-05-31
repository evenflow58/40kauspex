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
import { companionApi } from '../api'
import type { Game } from '../types'
import { LoadingView, ErrorView } from '../components/StatusViews'

/**
 * Game selection page (`/companion`).
 *
 * Lists every game on the platform. Available games link to the army builder;
 * games that are not yet supported render a disabled "Coming soon" card.
 */
export default function GameSelectionPage() {
  const navigate = useNavigate()
  const [games, setGames] = useState<Game[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    setError(null)
    setGames(null)
    companionApi
      .listGames()
      .then(setGames)
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : 'Failed to load games')
      )
  }, [])

  useEffect(load, [load])

  return (
    <section className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">
            Choose your game
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Pick a tabletop game to start building an army and using the phase
            companion.
          </p>
        </div>
        <Button variant="outline" asChild>
          <Link to="/companion/armies">My Armies</Link>
        </Button>
      </header>

      {error && <ErrorView message={error} onRetry={load} />}
      {!error && !games && <LoadingView label="Loading games…" />}

      {games && (
        <div className="grid gap-4 sm:grid-cols-2">
          {games.map((game) => (
            <Card
              key={game.gameId}
              className={game.available ? '' : 'opacity-60'}
            >
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  {game.name}
                  {!game.available && (
                    <span className="rounded bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                      Coming soon
                    </span>
                  )}
                </CardTitle>
                <CardDescription>{game.description}</CardDescription>
              </CardHeader>
              <CardContent />
              <CardFooter>
                <Button
                  disabled={!game.available}
                  aria-disabled={!game.available}
                  onClick={() =>
                    navigate(`/companion/games/${game.gameId}/army`)
                  }
                >
                  {game.available ? 'Build an army' : 'Not available yet'}
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}
    </section>
  )
}
