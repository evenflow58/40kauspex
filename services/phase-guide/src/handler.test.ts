import { describe, it, expect, beforeEach } from 'vitest'
import { mockClient } from 'aws-sdk-client-mock'
import { GetCommand, QueryCommand } from '@aws-sdk/lib-dynamodb'
import type { APIGatewayProxyEventV2 } from 'aws-lambda'
import { ddb } from './db'
import { handler } from './handler'

const ddbMock = mockClient(ddb)

/** Build an HTTP API v2 event with an optional authenticated `sub` claim. */
function makeEvent(
  opts: { sub?: string; armyId?: string } = {}
): APIGatewayProxyEventV2 {
  return {
    routeKey: 'GET /phase-guide/{armyId}',
    pathParameters: opts.armyId ? { armyId: opts.armyId } : {},
    requestContext: opts.sub
      ? { authorizer: { jwt: { claims: { sub: opts.sub } } } }
      : {},
  } as unknown as APIGatewayProxyEventV2
}

/** Narrow an APIGatewayProxyResultV2 union to its structured object form. */
function structured(result: Awaited<ReturnType<typeof handler>>) {
  if (typeof result === 'string' || result === undefined) {
    throw new Error('expected a structured proxy result')
  }
  return result
}

const ARMY_ITEM = {
  armyId: 'a1',
  name: 'Strike Force',
  gameId: 'warhammer-40k',
  factionName: 'Space Marines',
}

const PHASES = [
  {
    order: 2,
    name: 'Movement Phase',
    description: 'Move units.',
    keyActions: ['Move'],
    relevantKeywords: ['FLY', 'INFANTRY'],
  },
  {
    order: 3,
    name: 'Shooting Phase',
    description: 'Shoot.',
    keyActions: ['Shoot'],
    relevantKeywords: ['RAPID FIRE', 'HEAVY'],
  },
]

describe('phase-guide handler', () => {
  beforeEach(() => {
    ddbMock.reset()
  })

  it('returns 401 when no authenticated sub is present', async () => {
    const result = structured(await handler(makeEvent({ armyId: 'a1' })))
    expect(result.statusCode).toBe(401)
  })

  it('returns 404 when the army is not owned by the caller', async () => {
    ddbMock.on(GetCommand).resolves({ Item: undefined })

    const result = structured(
      await handler(makeEvent({ sub: 'user-1', armyId: 'a1' }))
    )
    expect(result.statusCode).toBe(404)
  })

  it('matches unit keywords to phase keywords case-insensitively', async () => {
    ddbMock.on(GetCommand).resolves({ Item: ARMY_ITEM })
    // First QueryCommand: army units. Second QueryCommand: phases.
    ddbMock
      .on(QueryCommand)
      .resolvesOnce({
        Items: [
          {
            entryId: 'e1',
            unitName: 'Intercessor Squad',
            keywords: ['infantry', 'core', 'rapid fire'],
            briefAbility: 'Objective Secured.',
          },
        ],
      })
      .resolvesOnce({ Items: PHASES })

    const result = structured(
      await handler(makeEvent({ sub: 'user-1', armyId: 'a1' }))
    )
    expect(result.statusCode).toBe(200)
    const body = JSON.parse(result.body ?? '') as {
      phases: { name: string; units: { matchedKeywords: string[] }[] }[]
    }

    const movement = body.phases.find((p) => p.name === 'Movement Phase')!
    expect(movement.units).toHaveLength(1)
    expect(movement.units[0].matchedKeywords).toEqual(['infantry'])

    const shooting = body.phases.find((p) => p.name === 'Shooting Phase')!
    expect(shooting.units[0].matchedKeywords).toEqual(['rapid fire'])
  })

  it('returns every phase even when no army units match', async () => {
    ddbMock.on(GetCommand).resolves({ Item: ARMY_ITEM })
    ddbMock
      .on(QueryCommand)
      .resolvesOnce({
        Items: [
          {
            entryId: 'e1',
            unitName: 'Mystery Unit',
            keywords: ['UNKNOWN'],
            briefAbility: null,
          },
        ],
      })
      .resolvesOnce({ Items: PHASES })

    const result = structured(
      await handler(makeEvent({ sub: 'user-1', armyId: 'a1' }))
    )
    const body = JSON.parse(result.body ?? '') as { phases: unknown[] }
    expect(body.phases).toHaveLength(2)
  })

  it('returns 400 when armyId path parameter is missing', async () => {
    const result = structured(await handler(makeEvent({ sub: 'user-1' })))
    expect(result.statusCode).toBe(400)
  })

  it('returns 500 when DynamoDB throws', async () => {
    ddbMock.on(GetCommand).rejects(new Error('boom'))

    const result = structured(
      await handler(makeEvent({ sub: 'user-1', armyId: 'a1' }))
    )
    expect(result.statusCode).toBe(500)
  })
})
