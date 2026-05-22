import { useEffect, useMemo, useState, useCallback } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@40kauspex/ui'
import { useAuth } from '@40kauspex/auth'
import { companionApi, unitToPayload } from '../api'
import type { Faction, Unit } from '../types'
import {
  LoadingView,
  ErrorView,
  KeywordChip,
} from '../components/StatusViews'

/** Order battlefield-role groups so the unit browser reads predictably. */
const ROLE_ORDER = [
  'Character',
  'Battleline',
  'Infantry',
  'Mounted',
  'Vehicle',
  'Other',
]

/** A unit added to the working army list, with a client-side instance id. */
interface ArmyEntry {
  /** Local-only id so the same unit can be added more than once. */
  localId: string
  unit: Unit
}

/**
 * Army builder page (`/companion/games/:gameId/army`).
 *
 * Pick a faction, browse its units grouped by battlefield role, add units to
 * a working army list, name the army and save it. On save the army is created
 * via `POST /armies` and the user is taken to the phase companion.
 */
export default function ArmyBuilderPage() {
  const { gameId = '' } = useParams()
  const navigate = useNavigate()
  const { accessToken } = useAuth()

  const [factions, setFactions] = useState<Faction[] | null>(null)
  const [factionsError, setFactionsError] = useState<string | null>(null)
  const [selectedFaction, setSelectedFaction] = useState<Faction | null>(null)

  const [units, setUnits] = useState<Unit[] | null>(null)
  const [unitsLoading, setUnitsLoading] = useState(false)
  const [unitsError, setUnitsError] = useState<string | null>(null)

  const [armyName, setArmyName] = useState('')
  const [entries, setEntries] = useState<ArmyEntry[]>([])
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  // Load the game's factions on mount.
  const loadFactions = useCallback(() => {
    setFactionsError(null)
    setFactions(null)
    companionApi
      .listFactions(gameId)
      .then(setFactions)
      .catch((err: unknown) =>
        setFactionsError(
          err instanceof Error ? err.message : 'Failed to load factions'
        )
      )
  }, [gameId])

  useEffect(loadFactions, [loadFactions])

  // Load units whenever the selected faction changes. Switching faction
  // clears the working army list — the units would belong to the old faction.
  useEffect(() => {
    if (!selectedFaction) return
    let cancelled = false
    setUnitsLoading(true)
    setUnitsError(null)
    setUnits(null)
    companionApi
      .listUnits(selectedFaction.factionId)
      .then((u) => {
        if (!cancelled) setUnits(u)
      })
      .catch((err: unknown) => {
        if (!cancelled)
          setUnitsError(
            err instanceof Error ? err.message : 'Failed to load units'
          )
      })
      .finally(() => {
        if (!cancelled) setUnitsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [selectedFaction])

  /** Units grouped by battlefield role, in display order. */
  const groupedUnits = useMemo(() => {
    if (!units) return []
    const byRole = new Map<string, Unit[]>()
    for (const unit of units) {
      const role = unit.battlefieldRole || 'Other'
      const list = byRole.get(role) ?? []
      list.push(unit)
      byRole.set(role, list)
    }
    return ROLE_ORDER.filter((role) => byRole.has(role)).map((role) => ({
      role,
      units: byRole.get(role)!,
    }))
  }, [units])

  function selectFaction(faction: Faction) {
    setSelectedFaction(faction)
    setEntries([])
    setSaveError(null)
  }

  function addUnit(unit: Unit) {
    setEntries((prev) => [
      ...prev,
      { localId: `${unit.unitId}-${crypto.randomUUID()}`, unit },
    ])
  }

  function removeEntry(localId: string) {
    setEntries((prev) => prev.filter((e) => e.localId !== localId))
  }

  async function saveArmy() {
    if (!selectedFaction || armyName.trim().length === 0 || entries.length === 0)
      return
    setSaving(true)
    setSaveError(null)
    try {
      const army = await companionApi.createArmy(
        {
          name: armyName.trim(),
          gameId,
          factionId: selectedFaction.factionId,
          factionName: selectedFaction.name,
          units: entries.map((e) => unitToPayload(e.unit)),
        },
        accessToken
      )
      navigate(`/companion/games/${gameId}/army/${army.armyId}/phases`)
    } catch (err: unknown) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save army')
      setSaving(false)
    }
  }

  const canSave =
    armyName.trim().length > 0 && entries.length > 0 && !saving

  return (
    <section className="space-y-6">
      <div>
        <Button variant="link" asChild className="px-0">
          <Link to="/companion">&larr; Back to games</Link>
        </Button>
        <h2 className="text-2xl font-semibold tracking-tight">Army Builder</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Choose a faction, then add units to your army list.
        </p>
      </div>

      {/* Faction picker */}
      {factionsError && (
        <ErrorView message={factionsError} onRetry={loadFactions} />
      )}
      {!factionsError && !factions && (
        <LoadingView label="Loading factions…" />
      )}
      {factions && (
        <div
          className="flex flex-wrap gap-2"
          role="group"
          aria-label="Faction"
        >
          {factions.map((faction) => (
            <Button
              key={faction.factionId}
              variant={
                selectedFaction?.factionId === faction.factionId
                  ? 'default'
                  : 'outline'
              }
              size="sm"
              onClick={() => selectFaction(faction)}
            >
              {faction.name}
            </Button>
          ))}
        </div>
      )}

      {selectedFaction && (
        <div className="grid gap-4 lg:grid-cols-2">
          {/* Unit browser */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">
                {selectedFaction.name} units
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              {unitsLoading && <LoadingView label="Loading units…" />}
              {unitsError && <ErrorView message={unitsError} />}
              {!unitsLoading &&
                !unitsError &&
                groupedUnits.map((group) => (
                  <div key={group.role} className="space-y-2">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {group.role}
                    </h3>
                    <ul className="space-y-2">
                      {group.units.map((unit) => (
                        <li
                          key={unit.unitId}
                          className="rounded-md border border-border p-3"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="space-y-1">
                              <p className="text-sm font-medium">
                                {unit.name}
                              </p>
                              {unit.briefAbility && (
                                <p className="text-xs text-muted-foreground">
                                  {unit.briefAbility}
                                </p>
                              )}
                            </div>
                            <Button
                              size="sm"
                              onClick={() => addUnit(unit)}
                            >
                              Add
                            </Button>
                          </div>
                          <div className="mt-2 flex flex-wrap items-center gap-1">
                            <span className="mr-1 text-xs text-muted-foreground">
                              M{unit.movement}&quot;
                            </span>
                            {unit.hasRanged && (
                              <span className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                                Ranged
                              </span>
                            )}
                            {unit.hasMelee && (
                              <span className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                                Melee
                              </span>
                            )}
                            {unit.keywords.map((kw) => (
                              <KeywordChip key={kw} label={kw} />
                            ))}
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
            </CardContent>
          </Card>

          {/* Working army list */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Your army</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1">
                <label
                  htmlFor="army-name"
                  className="text-xs font-medium text-muted-foreground"
                >
                  Army name
                </label>
                <input
                  id="army-name"
                  value={armyName}
                  onChange={(e) => setArmyName(e.target.value)}
                  placeholder="e.g. Strike Force Ultima"
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                />
              </div>

              {entries.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No units yet — add units from the list on the left.
                </p>
              ) : (
                <ul className="space-y-2">
                  {entries.map((entry) => (
                    <li
                      key={entry.localId}
                      className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2"
                    >
                      <span className="text-sm">{entry.unit.name}</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeEntry(entry.localId)}
                      >
                        Remove
                      </Button>
                    </li>
                  ))}
                </ul>
              )}

              {saveError && <ErrorView message={saveError} />}

              <Button
                className="w-full"
                disabled={!canSave}
                onClick={saveArmy}
              >
                {saving ? 'Saving…' : 'Save army & open phase companion'}
              </Button>
            </CardContent>
          </Card>
        </div>
      )}
    </section>
  )
}
