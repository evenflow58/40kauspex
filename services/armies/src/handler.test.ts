import { describe, it, expect, beforeEach } from 'vitest'
import { mockClient } from 'aws-sdk-client-mock'
import {
  BatchWriteCommand,
  DeleteCommand,
  GetCommand,
  PutCommand,
  QueryCommand,
} from '@aws-sdk/lib-dynamodb'
import type { APIGatewayProxyEventV2 } from 'aws-lambda'
import { ddb } from './db'
import { handler } from './handler'

const ddbMock = mockClient(ddb)

/** Build an HTTP API v2 event with an optional authenticated `sub` claim. */
function makeEvent(
  routeKey: string,
  opts: {
    sub?: string
    armyId?: string
    body?: unknown
  } = {}
): APIGatewayProxyEventV2 {
  return {
    routeKey,
    pathParameters: opts.armyId ? { armyId: opts.armyId } : {},
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
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

describe('armies handler', () => {
  beforeEach(() => {
    ddbMock.reset()
  })

  it('returns 401 when no authenticated sub is present', async () => {
    const result = structured(await handler(makeEvent('GET /armies')))
    expect(result.statusCode).toBe(401)
  })

  it('GET /armies lists the caller-owned armies', async () => {
    ddbMock.on(QueryCommand).resolves({
      Items: [
        {
          armyId: 'a1',
          name: 'Strike Force',
          gameId: 'warhammer-40k',
          factionId: 'space-marines',
          factionName: 'Space Marines',
          createdAt: 't',
          updatedAt: 't',
        },
      ],
    })

    const result = structured(
      await handler(makeEvent('GET /armies', { sub: 'user-1' }))
    )
    expect(result.statusCode).toBe(200)
    const armies = JSON.parse(result.body ?? '') as { armyId: string }[]
    expect(armies[0].armyId).toBe('a1')
  })

  it('POST /armies creates an army and returns 201', async () => {
    ddbMock.on(PutCommand).resolves({})
    ddbMock.on(BatchWriteCommand).resolves({})

    const result = structured(
      await handler(
        makeEvent('POST /armies', {
          sub: 'user-1',
          body: {
            name: 'Strike Force',
            gameId: 'warhammer-40k',
            factionId: 'space-marines',
            factionName: 'Space Marines',
            units: [{ unitId: 'sm-intercessor-squad', unitName: 'Intercessor Squad' }],
          },
        })
      )
    )
    expect(result.statusCode).toBe(201)
    const army = JSON.parse(result.body ?? '') as {
      armyId: string
      units: unknown[]
    }
    expect(army.armyId).toBeTruthy()
    expect(army.units).toHaveLength(1)
  })

  it('POST /armies returns 400 when required fields are missing', async () => {
    const result = structured(
      await handler(
        makeEvent('POST /armies', { sub: 'user-1', body: { name: 'x' } })
      )
    )
    expect(result.statusCode).toBe(400)
  })

  it('GET /armies/{armyId} returns 404 when the army is not owned by the caller', async () => {
    ddbMock.on(GetCommand).resolves({ Item: undefined })

    const result = structured(
      await handler(
        makeEvent('GET /armies/{armyId}', { sub: 'user-1', armyId: 'a1' })
      )
    )
    expect(result.statusCode).toBe(404)
  })

  it('GET /armies/{armyId} returns the army with its units when owned', async () => {
    ddbMock.on(GetCommand).resolves({
      Item: {
        armyId: 'a1',
        name: 'Strike Force',
        gameId: 'warhammer-40k',
        factionId: 'space-marines',
        factionName: 'Space Marines',
        createdAt: 't',
        updatedAt: 't',
      },
    })
    ddbMock.on(QueryCommand).resolves({
      Items: [
        {
          entryId: 'e1',
          unitId: 'sm-intercessor-squad',
          unitName: 'Intercessor Squad',
          keywords: ['INFANTRY'],
          movement: 6,
          hasRanged: true,
          hasMelee: true,
          battlefieldRole: 'Battleline',
        },
      ],
    })

    const result = structured(
      await handler(
        makeEvent('GET /armies/{armyId}', { sub: 'user-1', armyId: 'a1' })
      )
    )
    expect(result.statusCode).toBe(200)
    const army = JSON.parse(result.body ?? '') as { units: { entryId: string }[] }
    expect(army.units[0].entryId).toBe('e1')
  })

  it('PUT /armies/{armyId} returns 404 for an army the caller does not own', async () => {
    ddbMock.on(GetCommand).resolves({ Item: undefined })

    const result = structured(
      await handler(
        makeEvent('PUT /armies/{armyId}', {
          sub: 'user-1',
          armyId: 'a1',
          body: { name: 'Renamed' },
        })
      )
    )
    expect(result.statusCode).toBe(404)
  })

  it('PUT /armies/{armyId} replaces the unit set when units are supplied', async () => {
    ddbMock.on(GetCommand).resolves({
      Item: {
        armyId: 'a1',
        name: 'Strike Force',
        gameId: 'warhammer-40k',
        factionId: 'space-marines',
        factionName: 'Space Marines',
        createdAt: 't',
        updatedAt: 't',
      },
    })
    // QueryCommand backs deleteArmyUnits — no existing units to delete.
    ddbMock.on(QueryCommand).resolves({ Items: [] })
    ddbMock.on(PutCommand).resolves({})
    ddbMock.on(BatchWriteCommand).resolves({})

    const result = structured(
      await handler(
        makeEvent('PUT /armies/{armyId}', {
          sub: 'user-1',
          armyId: 'a1',
          body: {
            units: [{ unitId: 'sm-librarian', unitName: 'Librarian' }],
          },
        })
      )
    )
    expect(result.statusCode).toBe(200)
    const army = JSON.parse(result.body ?? '') as { units: unknown[] }
    expect(army.units).toHaveLength(1)
  })

  it('DELETE /armies/{armyId} returns 204 when owned', async () => {
    ddbMock.on(GetCommand).resolves({
      Item: { armyId: 'a1', name: 'Strike Force' },
    })
    ddbMock.on(QueryCommand).resolves({ Items: [] })
    ddbMock.on(DeleteCommand).resolves({})

    const result = structured(
      await handler(
        makeEvent('DELETE /armies/{armyId}', { sub: 'user-1', armyId: 'a1' })
      )
    )
    expect(result.statusCode).toBe(204)
  })

  it('DELETE /armies/{armyId} returns 404 for an unowned army', async () => {
    ddbMock.on(GetCommand).resolves({ Item: undefined })

    const result = structured(
      await handler(
        makeEvent('DELETE /armies/{armyId}', { sub: 'user-1', armyId: 'a1' })
      )
    )
    expect(result.statusCode).toBe(404)
  })

  it('returns 404 for an unrecognised route', async () => {
    const result = structured(
      await handler(makeEvent('PATCH /armies', { sub: 'user-1' }))
    )
    expect(result.statusCode).toBe(404)
  })
})
