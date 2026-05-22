import { describe, it, expect, beforeEach } from 'vitest'
import { mockClient } from 'aws-sdk-client-mock'
import { GetCommand, QueryCommand } from '@aws-sdk/lib-dynamodb'
import type { APIGatewayProxyEventV2 } from 'aws-lambda'
import { ddb } from './db'
import { handler } from './handler'

const ddbMock = mockClient(ddb)

/** Build a minimal HTTP API v2 event with the route + path params under test. */
function makeEvent(
  routeKey: string,
  pathParameters: Record<string, string> = {}
): APIGatewayProxyEventV2 {
  return { routeKey, pathParameters } as unknown as APIGatewayProxyEventV2
}

/** Narrow an APIGatewayProxyResultV2 union to its structured object form. */
function structured(result: Awaited<ReturnType<typeof handler>>) {
  if (typeof result === 'string' || result === undefined) {
    throw new Error('expected a structured proxy result')
  }
  return result
}

describe('games handler', () => {
  beforeEach(() => {
    ddbMock.reset()
  })

  it('GET /games returns the list of games', async () => {
    ddbMock.on(QueryCommand).resolves({
      Items: [
        {
          gameId: 'warhammer-40k',
          name: 'Warhammer 40,000',
          available: true,
          description: 'The grim darkness of the far future.',
        },
      ],
    })

    const result = structured(await handler(makeEvent('GET /games')))
    expect(result.statusCode).toBe(200)
    expect(JSON.parse(result.body ?? '')).toEqual([
      {
        gameId: 'warhammer-40k',
        name: 'Warhammer 40,000',
        available: true,
        description: 'The grim darkness of the far future.',
      },
    ])
  })

  it('GET /games/{gameId}/phases returns phases sorted by order', async () => {
    ddbMock.on(GetCommand).resolves({ Item: { gameId: 'warhammer-40k' } })
    ddbMock.on(QueryCommand).resolves({
      Items: [
        { order: 3, name: 'Shooting Phase', description: 'd', keyActions: [], relevantKeywords: [] },
        { order: 1, name: 'Command Phase', description: 'd', keyActions: [], relevantKeywords: [] },
      ],
    })

    const result = structured(
      await handler(makeEvent('GET /games/{gameId}/phases', { gameId: 'warhammer-40k' }))
    )
    expect(result.statusCode).toBe(200)
    const phases = JSON.parse(result.body ?? '') as { order: number }[]
    expect(phases.map((p) => p.order)).toEqual([1, 3])
  })

  it('GET /games/{gameId}/phases returns 404 for an unknown game', async () => {
    ddbMock.on(GetCommand).resolves({ Item: undefined })

    const result = structured(
      await handler(makeEvent('GET /games/{gameId}/phases', { gameId: 'nope' }))
    )
    expect(result.statusCode).toBe(404)
  })

  it('GET /games/{gameId}/factions returns the factions for a game', async () => {
    ddbMock.on(QueryCommand).resolves({
      Items: [{ factionId: 'orks', name: 'Orks' }],
    })

    const result = structured(
      await handler(makeEvent('GET /games/{gameId}/factions', { gameId: 'warhammer-40k' }))
    )
    expect(result.statusCode).toBe(200)
    expect(JSON.parse(result.body ?? '')).toEqual([
      { factionId: 'orks', name: 'Orks' },
    ])
  })

  it('GET /factions/{factionId}/units returns units with a null briefAbility fallback', async () => {
    ddbMock.on(QueryCommand).resolves({
      Items: [
        {
          unitId: 'ork-boyz',
          factionId: 'orks',
          name: 'Boyz',
          keywords: ['INFANTRY', 'CORE'],
          movement: 6,
          hasRanged: true,
          hasMelee: true,
          battlefieldRole: 'Battleline',
        },
      ],
    })

    const result = structured(
      await handler(makeEvent('GET /factions/{factionId}/units', { factionId: 'orks' }))
    )
    expect(result.statusCode).toBe(200)
    const units = JSON.parse(result.body ?? '') as { briefAbility: string | null }[]
    expect(units[0].briefAbility).toBeNull()
  })

  it('returns 404 for an unrecognised route', async () => {
    const result = structured(await handler(makeEvent('DELETE /games')))
    expect(result.statusCode).toBe(404)
  })

  it('returns 500 when DynamoDB throws', async () => {
    ddbMock.on(QueryCommand).rejects(new Error('boom'))

    const result = structured(await handler(makeEvent('GET /games')))
    expect(result.statusCode).toBe(500)
  })
})
