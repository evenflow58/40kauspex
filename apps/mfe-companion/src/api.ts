import type {
  Army,
  ArmySummary,
  ArmyUnit,
  Faction,
  Game,
  Phase,
  PhaseGuide,
  Unit,
} from './types'

/**
 * HTTP client for the 40K Auspex companion API.
 *
 * The API base URL is environment-specific and is published in the runtime
 * `/auth-config.json` (written to the site root by the deploy step) — the
 * same file the shell's `AuthProvider` reads. It is fetched once and cached.
 *
 * Authed routes (`/armies`, `/phase-guide`) require a Cognito access token,
 * passed by the caller as `Authorization: Bearer <token>`. Public reference
 * routes (`/games`, `/factions`) need no token.
 */

let apiUrlPromise: Promise<string> | null = null

/** Fetch and cache the API base URL from `/auth-config.json`. */
function getApiUrl(): Promise<string> {
  if (!apiUrlPromise) {
    apiUrlPromise = fetch('/auth-config.json', { cache: 'no-store' })
      .then((res) => {
        if (!res.ok) {
          throw new Error(`auth-config.json responded ${res.status}`)
        }
        return res.json() as Promise<{ apiUrl?: string }>
      })
      .then((cfg) => {
        if (!cfg.apiUrl) {
          throw new Error('auth-config.json has no apiUrl — API not deployed')
        }
        return cfg.apiUrl.replace(/\/$/, '')
      })
      .catch((err: unknown) => {
        // Reset so a later call can retry rather than caching the failure.
        apiUrlPromise = null
        throw err
      })
  }
  return apiUrlPromise
}

/** Perform a JSON request against the companion API. */
async function request<T>(
  path: string,
  options: { method?: string; body?: unknown; token?: string | null } = {}
): Promise<T> {
  const base = await getApiUrl()
  const headers: Record<string, string> = {}
  if (options.body !== undefined) headers['Content-Type'] = 'application/json'
  if (options.token) headers['Authorization'] = `Bearer ${options.token}`

  const res = await fetch(`${base}${path}`, {
    method: options.method ?? 'GET',
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  })

  if (!res.ok) {
    let message = `Request failed (${res.status})`
    try {
      const errBody = (await res.json()) as { error?: string }
      if (errBody.error) message = errBody.error
    } catch {
      // Non-JSON error body — keep the status-based message.
    }
    throw new Error(message)
  }

  // 204 No Content (DELETE) has no body to parse.
  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}

/** Payload describing a unit when creating or updating an army. */
export interface UnitPayload {
  unitId: string
  unitName: string
  keywords: string[]
  movement: number
  hasRanged: boolean
  hasMelee: boolean
  briefAbility: string | null
  battlefieldRole: string
}

/** Map a catalogue `Unit` to the army-unit payload the API expects. */
export function unitToPayload(unit: Unit): UnitPayload {
  return {
    unitId: unit.unitId,
    unitName: unit.name,
    keywords: unit.keywords,
    movement: unit.movement,
    hasRanged: unit.hasRanged,
    hasMelee: unit.hasMelee,
    briefAbility: unit.briefAbility,
    battlefieldRole: unit.battlefieldRole,
  }
}

/** Map a saved `ArmyUnit` back to a payload (for PUT round-trips). */
export function armyUnitToPayload(unit: ArmyUnit): UnitPayload {
  return {
    unitId: unit.unitId,
    unitName: unit.unitName,
    keywords: unit.keywords,
    movement: unit.movement,
    hasRanged: unit.hasRanged,
    hasMelee: unit.hasMelee,
    briefAbility: unit.briefAbility,
    battlefieldRole: unit.battlefieldRole,
  }
}

/** Companion API surface used by the MFE pages. */
export const companionApi = {
  /** GET /games — all games. */
  listGames: () => request<Game[]>('/games'),

  /** GET /games/{gameId}/factions — factions for a game. */
  listFactions: (gameId: string) =>
    request<Faction[]>(`/games/${encodeURIComponent(gameId)}/factions`),

  /** GET /games/{gameId}/phases — ordered phases for a game. */
  listPhases: (gameId: string) =>
    request<Phase[]>(`/games/${encodeURIComponent(gameId)}/phases`),

  /** GET /factions/{factionId}/units — units for a faction. */
  listUnits: (factionId: string) =>
    request<Unit[]>(`/factions/${encodeURIComponent(factionId)}/units`),

  /** GET /armies — the signed-in user's armies. */
  listArmies: (token: string | null) =>
    request<ArmySummary[]>('/armies', { token }),

  /** GET /armies/{armyId} — one army with its units. */
  getArmy: (armyId: string, token: string | null) =>
    request<Army>(`/armies/${encodeURIComponent(armyId)}`, { token }),

  /** POST /armies — create a new army. */
  createArmy: (
    payload: {
      name: string
      gameId: string
      factionId: string
      factionName: string
      units: UnitPayload[]
    },
    token: string | null
  ) => request<Army>('/armies', { method: 'POST', body: payload, token }),

  /** PUT /armies/{armyId} — rename and/or replace the army's unit set. */
  updateArmy: (
    armyId: string,
    payload: { name?: string; units?: UnitPayload[] },
    token: string | null
  ) =>
    request<Army>(`/armies/${encodeURIComponent(armyId)}`, {
      method: 'PUT',
      body: payload,
      token,
    }),

  /** DELETE /armies/{armyId}. */
  deleteArmy: (armyId: string, token: string | null) =>
    request<void>(`/armies/${encodeURIComponent(armyId)}`, {
      method: 'DELETE',
      token,
    }),

  /** GET /phase-guide/{armyId} — per-phase guidance for an army. */
  getPhaseGuide: (armyId: string, token: string | null) =>
    request<PhaseGuide>(`/phase-guide/${encodeURIComponent(armyId)}`, {
      token,
    }),
}
