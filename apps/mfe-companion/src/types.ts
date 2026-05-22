/** Shared domain types for the 40K Auspex companion MFE. */

/** A playable game on the platform. */
export interface Game {
  gameId: string
  name: string
  available: boolean
  description: string
}

/** A faction within a game. */
export interface Faction {
  factionId: string
  name: string
}

/** A unit available to a faction. */
export interface Unit {
  unitId: string
  factionId: string
  name: string
  keywords: string[]
  movement: number
  hasRanged: boolean
  hasMelee: boolean
  briefAbility: string | null
  battlefieldRole: string
}

/** A game phase with its reference text and relevant keywords. */
export interface Phase {
  order: number
  name: string
  description: string
  keyActions: string[]
  relevantKeywords: string[]
}

/** A unit entry on a saved army (carries a denormalised unit snapshot). */
export interface ArmyUnit {
  entryId: string
  unitId: string
  unitName: string
  keywords: string[]
  movement: number
  hasRanged: boolean
  hasMelee: boolean
  briefAbility: string | null
  battlefieldRole: string
}

/** Army summary, as returned by `GET /armies`. */
export interface ArmySummary {
  armyId: string
  name: string
  gameId: string
  factionId: string
  factionName: string
  createdAt: string
  updatedAt: string
}

/** A full army with its units, as returned by `GET /armies/{armyId}`. */
export interface Army extends ArmySummary {
  units: ArmyUnit[]
}

/** A phase enriched with the caller's relevant units (phase-guide response). */
export interface PhaseGuidePhase extends Phase {
  units: {
    entryId: string
    unitName: string
    matchedKeywords: string[]
    briefAbility: string | null
  }[]
}

/** Full phase-guide response for an army. */
export interface PhaseGuide {
  armyId: string
  armyName: string
  gameId: string
  factionName: string
  phases: PhaseGuidePhase[]
}
