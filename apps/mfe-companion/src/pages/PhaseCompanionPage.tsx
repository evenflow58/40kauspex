import { useEffect, useState, useCallback } from 'react'
import { useParams, Link } from 'react-router-dom'
import { Button, Card, CardContent } from '@40kauspex/ui'
import { useAuth } from '@40kauspex/auth'
import { companionApi } from '../api'
import type { PhaseGuide } from '../types'
import {
  LoadingView,
  ErrorView,
  KeywordChip,
  MatchedKeywordChip,
} from '../components/StatusViews'

/**
 * Phase companion page
 * (`/companion/games/:gameId/army/:armyId/phases`).
 *
 * Shows the 5 game phases as a synced tracker + tab strip. The "active phase"
 * is highlighted in the tracker and is the phase whose panel is shown. For
 * each phase the panel lists which of the army's units have keywords relevant
 * to that phase, with the matched keywords highlighted.
 */
export default function PhaseCompanionPage() {
  const { armyId = '' } = useParams()
  const { accessToken } = useAuth()

  const [guide, setGuide] = useState<PhaseGuide | null>(null)
  const [error, setError] = useState<string | null>(null)
  /** Index into `guide.phases` of the currently active phase. */
  const [activeIndex, setActiveIndex] = useState(0)

  const load = useCallback(() => {
    setError(null)
    setGuide(null)
    setActiveIndex(0)
    companionApi
      .getPhaseGuide(armyId, accessToken)
      .then(setGuide)
      .catch((err: unknown) =>
        setError(
          err instanceof Error ? err.message : 'Failed to load phase guide'
        )
      )
  }, [armyId, accessToken])

  useEffect(load, [load])

  if (error) return <ErrorView message={error} onRetry={load} />
  if (!guide) return <LoadingView label="Loading phase companion…" />

  const phases = guide.phases
  const activePhase = phases[activeIndex]

  return (
    <section className="space-y-6">
      <div>
        <Button variant="link" asChild className="px-0">
          <Link to="/companion">&larr; Back to games</Link>
        </Button>
        <h2 className="text-2xl font-semibold tracking-tight">
          {guide.armyName}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {guide.factionName} — phase companion
        </p>
      </div>

      {/* Active-phase tracker */}
      <div className="space-y-3">
        <div className="flex flex-wrap gap-2">
          {phases.map((phase, index) => (
            <button
              key={phase.order}
              type="button"
              onClick={() => setActiveIndex(index)}
              aria-current={index === activeIndex ? 'step' : undefined}
              className={
                'rounded-full px-3 py-1 text-xs font-medium transition-colors ' +
                (index === activeIndex
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-muted/70')
              }
            >
              {phase.order}. {phase.name}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={activeIndex === 0}
            onClick={() => setActiveIndex((i) => Math.max(0, i - 1))}
          >
            Previous phase
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={activeIndex === phases.length - 1}
            onClick={() =>
              setActiveIndex((i) => Math.min(phases.length - 1, i + 1))
            }
          >
            Next phase
          </Button>
        </div>
      </div>

      {/* Tab strip */}
      <div
        role="tablist"
        aria-label="Game phases"
        className="flex flex-wrap gap-1 border-b border-border"
      >
        {phases.map((phase, index) => (
          <button
            key={phase.order}
            type="button"
            role="tab"
            id={`phase-tab-${phase.order}`}
            aria-selected={index === activeIndex}
            aria-controls={`phase-panel-${phase.order}`}
            onClick={() => setActiveIndex(index)}
            className={
              '-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors ' +
              (index === activeIndex
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground')
            }
          >
            {phase.name}
          </button>
        ))}
      </div>

      {/* Active phase panel */}
      {activePhase && (
        <div
          role="tabpanel"
          id={`phase-panel-${activePhase.order}`}
          aria-labelledby={`phase-tab-${activePhase.order}`}
        >
          <Card>
            <CardContent className="space-y-6 p-6">
              <div className="space-y-1">
                <h3 className="text-lg font-semibold">{activePhase.name}</h3>
                <p className="text-sm text-muted-foreground">
                  {activePhase.description}
                </p>
              </div>

              <div className="space-y-2">
                <h4 className="text-sm font-semibold">Key actions</h4>
                <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                  {activePhase.keyActions.map((action) => (
                    <li key={action}>{action}</li>
                  ))}
                </ul>
              </div>

              <div className="space-y-2">
                <h4 className="text-sm font-semibold">Relevant keywords</h4>
                <div className="flex flex-wrap gap-1">
                  {activePhase.relevantKeywords.map((kw) => (
                    <KeywordChip key={kw} label={kw} />
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <h4 className="text-sm font-semibold">
                  Your units for this phase
                </h4>
                {activePhase.units.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No units in your army have abilities relevant to this
                    phase.
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {activePhase.units.map((unit) => (
                      <li
                        key={unit.entryId}
                        className="rounded-md border border-border p-3"
                      >
                        <p className="text-sm font-medium">{unit.unitName}</p>
                        {unit.briefAbility && (
                          <p className="mt-1 text-xs text-muted-foreground">
                            {unit.briefAbility}
                          </p>
                        )}
                        <div className="mt-2 flex flex-wrap gap-1">
                          {unit.matchedKeywords.map((kw) => (
                            <MatchedKeywordChip key={kw} label={kw} />
                          ))}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </section>
  )
}
