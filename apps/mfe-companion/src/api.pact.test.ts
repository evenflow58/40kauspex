// @vitest-environment node
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it, expect } from 'vitest'
import { PactV3, MatchersV3 } from '@pact-foundation/pact'
import { companionApi, _overrideApiUrl } from './api'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PACTS_DIR = resolve(__dirname, '../../../pacts')

const { eachLike, string, boolean, integer } = MatchersV3

// Shared test constants — must match the provider state handlers in each
// service's pact test so that Pact's verification replays the same paths.
const GAME_ID = 'wh40k-10e'
const FACTION_ID = 'orks'
const ARMY_ID = 'army-1'
const TOKEN = 'pact-test-token'

// ---------------------------------------------------------------------------
// Games service
// ---------------------------------------------------------------------------

const gamesProvider = new PactV3({
  consumer: 'mfe-companion',
  provider: 'games-service',
  dir: PACTS_DIR,
  logLevel: 'error',
})

describe('games service contract', () => {
  it('GET /games returns a list of games', () =>
    gamesProvider
      .addInteraction({
        states: [{ description: 'some games exist' }],
        uponReceiving: 'a request for all games',
        withRequest: { method: 'GET', path: '/games' },
        willRespondWith: {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
          body: eachLike({
            gameId: string('wh40k-10e'),
            name: string('Warhammer 40,000 10th Edition'),
            available: boolean(true),
            description: string('The grim darkness of the far future.'),
          }),
        },
      })
      .executeTest(async (mockServer) => {
        _overrideApiUrl(mockServer.url)
        const games = await companionApi.listGames()
        expect(games.length).toBeGreaterThan(0)
        expect(games[0]).toMatchObject({
          gameId: expect.any(String),
          name: expect.any(String),
          available: expect.any(Boolean),
          description: expect.any(String),
        })
      }))

  it('GET /games/{gameId}/phases returns ordered phases', () =>
    gamesProvider
      .addInteraction({
        states: [{ description: `game ${GAME_ID} has phases` }],
        uponReceiving: 'a request for phases of a game',
        withRequest: { method: 'GET', path: `/games/${GAME_ID}/phases` },
        willRespondWith: {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
          body: eachLike({
            order: integer(1),
            name: string('Command Phase'),
            description: string('Issue orders.'),
            keyActions: eachLike(string('Issue Strategic Ploy')),
            relevantKeywords: eachLike(string('COMMAND')),
          }),
        },
      })
      .executeTest(async (mockServer) => {
        _overrideApiUrl(mockServer.url)
        const phases = await companionApi.listPhases(GAME_ID)
        expect(phases.length).toBeGreaterThan(0)
        expect(phases[0]).toMatchObject({
          order: expect.any(Number),
          name: expect.any(String),
          description: expect.any(String),
          keyActions: expect.any(Array),
          relevantKeywords: expect.any(Array),
        })
      }))

  it('GET /games/{gameId}/factions returns factions for a game', () =>
    gamesProvider
      .addInteraction({
        states: [{ description: `game ${GAME_ID} has factions` }],
        uponReceiving: 'a request for factions of a game',
        withRequest: { method: 'GET', path: `/games/${GAME_ID}/factions` },
        willRespondWith: {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
          body: eachLike({
            factionId: string('orks'),
            name: string('Orks'),
          }),
        },
      })
      .executeTest(async (mockServer) => {
        _overrideApiUrl(mockServer.url)
        const factions = await companionApi.listFactions(GAME_ID)
        expect(factions.length).toBeGreaterThan(0)
        expect(factions[0]).toMatchObject({
          factionId: expect.any(String),
          name: expect.any(String),
        })
      }))

  it('GET /factions/{factionId}/units returns units for a faction', () =>
    gamesProvider
      .addInteraction({
        states: [{ description: `faction ${FACTION_ID} has units` }],
        uponReceiving: 'a request for units of a faction',
        withRequest: { method: 'GET', path: `/factions/${FACTION_ID}/units` },
        willRespondWith: {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
          body: eachLike({
            unitId: string('ork-boyz'),
            factionId: string('orks'),
            name: string('Boyz'),
            keywords: eachLike(string('INFANTRY')),
            movement: integer(6),
            hasRanged: boolean(true),
            hasMelee: boolean(true),
            battlefieldRole: string('Battleline'),
          }),
        },
      })
      .executeTest(async (mockServer) => {
        _overrideApiUrl(mockServer.url)
        const units = await companionApi.listUnits(FACTION_ID)
        expect(units.length).toBeGreaterThan(0)
        expect(units[0]).toMatchObject({
          unitId: expect.any(String),
          factionId: expect.any(String),
          name: expect.any(String),
          keywords: expect.any(Array),
          movement: expect.any(Number),
          hasRanged: expect.any(Boolean),
          hasMelee: expect.any(Boolean),
          battlefieldRole: expect.any(String),
        })
      }))
})

// ---------------------------------------------------------------------------
// Armies service
// ---------------------------------------------------------------------------

const armiesProvider = new PactV3({
  consumer: 'mfe-companion',
  provider: 'armies-service',
  dir: PACTS_DIR,
  logLevel: 'error',
})

const armySummaryShape = {
  armyId: string('army-1'),
  name: string('Green Tide'),
  gameId: string('wh40k-10e'),
  factionId: string('orks'),
  factionName: string('Orks'),
  createdAt: string('2024-01-01T00:00:00.000Z'),
  updatedAt: string('2024-01-01T00:00:00.000Z'),
}

const armyUnitShape = {
  entryId: string('entry-1'),
  unitId: string('ork-boyz'),
  unitName: string('Boyz'),
  keywords: eachLike(string('INFANTRY')),
  movement: integer(6),
  hasRanged: boolean(true),
  hasMelee: boolean(true),
  // briefAbility is string|null — Pact V3 has no nullable matcher, so we
  // validate its presence/absence via TypeScript types rather than here.
  battlefieldRole: string('Battleline'),
}

const armyShape = {
  ...armySummaryShape,
  units: eachLike(armyUnitShape),
}

describe('armies service contract', () => {
  it("GET /armies returns the caller's armies", () =>
    armiesProvider
      .addInteraction({
        states: [{ description: 'user pact-test-sub has armies' }],
        uponReceiving: 'a request to list armies',
        withRequest: { method: 'GET', path: '/armies' },
        willRespondWith: {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
          body: eachLike(armySummaryShape),
        },
      })
      .executeTest(async (mockServer) => {
        _overrideApiUrl(mockServer.url)
        const armies = await companionApi.listArmies(TOKEN)
        expect(armies.length).toBeGreaterThan(0)
        expect(armies[0]).toMatchObject({
          armyId: expect.any(String),
          name: expect.any(String),
          gameId: expect.any(String),
          factionId: expect.any(String),
          factionName: expect.any(String),
          createdAt: expect.any(String),
          updatedAt: expect.any(String),
        })
      }))

  it('POST /armies creates a new army and returns 201', () =>
    armiesProvider
      .addInteraction({
        states: [{ description: 'user pact-test-sub can create armies' }],
        uponReceiving: 'a request to create an army',
        withRequest: {
          method: 'POST',
          path: '/armies',
          headers: { 'Content-Type': 'application/json' },
          body: {
            name: string('Green Tide'),
            gameId: string('wh40k-10e'),
            factionId: string('orks'),
            factionName: string('Orks'),
            units: [],
          },
        },
        willRespondWith: {
          status: 201,
          headers: { 'Content-Type': 'application/json' },
          body: { ...armySummaryShape, units: [] },
        },
      })
      .executeTest(async (mockServer) => {
        _overrideApiUrl(mockServer.url)
        const army = await companionApi.createArmy(
          {
            name: 'Green Tide',
            gameId: 'wh40k-10e',
            factionId: 'orks',
            factionName: 'Orks',
            units: [],
          },
          TOKEN
        )
        expect(army).toMatchObject({
          armyId: expect.any(String),
          name: expect.any(String),
          units: expect.any(Array),
        })
      }))

  it('GET /armies/{armyId} returns the army with its units', () =>
    armiesProvider
      .addInteraction({
        states: [{ description: 'user pact-test-sub owns army army-1' }],
        uponReceiving: 'a request to get an army by id',
        withRequest: { method: 'GET', path: `/armies/${ARMY_ID}` },
        willRespondWith: {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
          body: armyShape,
        },
      })
      .executeTest(async (mockServer) => {
        _overrideApiUrl(mockServer.url)
        const army = await companionApi.getArmy(ARMY_ID, TOKEN)
        expect(army).toMatchObject({
          armyId: expect.any(String),
          name: expect.any(String),
          units: expect.any(Array),
        })
        expect(army.units[0]).toMatchObject({
          entryId: expect.any(String),
          unitId: expect.any(String),
          unitName: expect.any(String),
        })
      }))

  it('PUT /armies/{armyId} renames the army', () =>
    armiesProvider
      .addInteraction({
        states: [{ description: 'user pact-test-sub owns army army-1' }],
        uponReceiving: 'a request to rename an army',
        withRequest: {
          method: 'PUT',
          path: `/armies/${ARMY_ID}`,
          headers: { 'Content-Type': 'application/json' },
          body: { name: string('Waaagh!') },
        },
        willRespondWith: {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
          body: armyShape,
        },
      })
      .executeTest(async (mockServer) => {
        _overrideApiUrl(mockServer.url)
        const army = await companionApi.updateArmy(ARMY_ID, { name: 'Waaagh!' }, TOKEN)
        expect(army).toMatchObject({
          armyId: expect.any(String),
          name: expect.any(String),
          units: expect.any(Array),
        })
      }))

  it('DELETE /armies/{armyId} deletes the army', () =>
    armiesProvider
      .addInteraction({
        states: [{ description: 'user pact-test-sub owns army army-1' }],
        uponReceiving: 'a request to delete an army',
        withRequest: { method: 'DELETE', path: `/armies/${ARMY_ID}` },
        willRespondWith: { status: 204 },
      })
      .executeTest(async (mockServer) => {
        _overrideApiUrl(mockServer.url)
        await companionApi.deleteArmy(ARMY_ID, TOKEN)
      }))
})

// ---------------------------------------------------------------------------
// Phase-guide service
// ---------------------------------------------------------------------------

const phaseGuideProvider = new PactV3({
  consumer: 'mfe-companion',
  provider: 'phase-guide-service',
  dir: PACTS_DIR,
  logLevel: 'error',
})

describe('phase-guide service contract', () => {
  it('GET /phase-guide/{armyId} returns per-phase unit guidance', () =>
    phaseGuideProvider
      .addInteraction({
        states: [{ description: 'user pact-test-sub owns army army-1 with infantry units' }],
        uponReceiving: 'a request for phase guidance for an army',
        withRequest: { method: 'GET', path: `/phase-guide/${ARMY_ID}` },
        willRespondWith: {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
          body: {
            armyId: string('army-1'),
            armyName: string('Green Tide'),
            gameId: string('wh40k-10e'),
            factionName: string('Orks'),
            phases: eachLike({
              order: integer(1),
              name: string('Command Phase'),
              description: string('Issue orders.'),
              keyActions: eachLike(string('Issue Strategic Ploy')),
              relevantKeywords: eachLike(string('INFANTRY')),
              units: eachLike({
                entryId: string('entry-1'),
                unitName: string('Boyz'),
              }),
            }),
          },
        },
      })
      .executeTest(async (mockServer) => {
        _overrideApiUrl(mockServer.url)
        const guide = await companionApi.getPhaseGuide(ARMY_ID, TOKEN)
        expect(guide).toMatchObject({
          armyId: expect.any(String),
          armyName: expect.any(String),
          gameId: expect.any(String),
          factionName: expect.any(String),
          phases: expect.any(Array),
        })
        expect(guide.phases[0].units.length).toBeGreaterThan(0)
      }))
})
