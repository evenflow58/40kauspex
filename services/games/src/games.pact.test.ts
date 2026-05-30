import { createServer } from 'node:http'
import type { AddressInfo, IncomingMessage, ServerResponse } from 'node:http'
import path from 'path'
import { describe, it, beforeAll, afterAll } from 'vitest'
import { Verifier } from '@pact-foundation/pact'
import { mockClient } from 'aws-sdk-client-mock'
import { GetCommand, QueryCommand } from '@aws-sdk/lib-dynamodb'
import type { APIGatewayProxyEventV2 } from 'aws-lambda'
import { ddb } from './db'
import { handler } from './handler'

const ddbMock = mockClient(ddb)

const GAME_ID = 'wh40k-10e'
const FACTION_ID = 'orks'
const PACTS_DIR = path.resolve(__dirname, '../../../pacts')
let port: number

const routes = [
  { method: 'GET', pattern: /^\/games$/, routeKey: 'GET /games', params: [] as string[] },
  { method: 'GET', pattern: /^\/games\/([^/]+)\/phases$/, routeKey: 'GET /games/{gameId}/phases', params: ['gameId'] },
  { method: 'GET', pattern: /^\/games\/([^/]+)\/factions$/, routeKey: 'GET /games/{gameId}/factions', params: ['gameId'] },
  { method: 'GET', pattern: /^\/factions\/([^/]+)\/units$/, routeKey: 'GET /factions/{factionId}/units', params: ['factionId'] },
]

function buildEvent(routeKey: string, pathParams: Record<string, string>): APIGatewayProxyEventV2 {
  return {
    version: '2.0',
    routeKey,
    rawPath: '',
    rawQueryString: '',
    headers: {},
    requestContext: {
      accountId: 'test',
      apiId: 'test',
      domainName: 'localhost',
      domainPrefix: 'localhost',
      http: { method: 'GET', path: '', protocol: 'HTTP/1.1', sourceIp: '127.0.0.1', userAgent: 'test' },
      requestId: 'test',
      routeKey,
      stage: '$default',
      time: '',
      timeEpoch: 0,
    } as APIGatewayProxyEventV2['requestContext'],
    pathParameters: Object.keys(pathParams).length > 0 ? pathParams : undefined,
    isBase64Encoded: false,
  }
}

const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
  const method = req.method ?? 'GET'
  const pathname = new URL(req.url ?? '/', 'http://localhost').pathname
  const route = routes.find((r) => r.method === method && r.pattern.test(pathname))

  if (!route) {
    res.writeHead(404, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'Not found' }))
    return
  }

  const match = pathname.match(route.pattern)!
  const pathParams: Record<string, string> = {}
  route.params.forEach((name, i) => { pathParams[name] = match[i + 1] })

  try {
    const result = await handler(buildEvent(route.routeKey, pathParams)) as {
      statusCode: number
      headers?: Record<string, string>
      body: string
    }
    res.writeHead(result.statusCode, { 'Content-Type': 'application/json', ...result.headers })
    res.end(result.body)
  } catch {
    res.writeHead(500, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'Internal server error' }))
  }
})

describe('games-service pact provider verification', () => {
  beforeAll(() => new Promise<void>((resolve) => {
    server.listen(0, () => {
      port = (server.address() as AddressInfo).port
      resolve()
    })
  }))
  afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())))

  it('satisfies the mfe-companion contract', async () => {
    await new Verifier({
      provider: 'games-service',
      providerBaseUrl: `http://localhost:${port}`,
      pactUrls: [path.join(PACTS_DIR, 'mfe-companion-games-service.json')],
      stateHandlers: {
        'some games exist': async () => {
          ddbMock.reset()
          ddbMock.on(QueryCommand).resolves({
            Items: [
              {
                gameId: GAME_ID,
                name: 'Warhammer 40,000 10th Edition',
                available: true,
                description: 'The grim darkness of the far future.',
              },
            ],
          })
        },

        [`game ${GAME_ID} has phases`]: async () => {
          ddbMock.reset()
          ddbMock.on(GetCommand).resolves({ Item: { gameId: GAME_ID } })
          ddbMock.on(QueryCommand).resolves({
            Items: [
              {
                order: 1,
                name: 'Command Phase',
                description: 'Issue orders.',
                keyActions: ['Issue Strategic Ploy'],
                relevantKeywords: ['COMMAND'],
              },
            ],
          })
        },

        [`game ${GAME_ID} has factions`]: async () => {
          ddbMock.reset()
          ddbMock.on(QueryCommand).resolves({
            Items: [{ factionId: FACTION_ID, name: 'Orks' }],
          })
        },

        [`faction ${FACTION_ID} has units`]: async () => {
          ddbMock.reset()
          ddbMock.on(QueryCommand).resolves({
            Items: [
              {
                unitId: 'ork-boyz',
                factionId: FACTION_ID,
                name: 'Boyz',
                keywords: ['INFANTRY', 'CORE'],
                movement: 6,
                hasRanged: true,
                hasMelee: true,
                battlefieldRole: 'Battleline',
              },
            ],
          })
        },
      },
      logLevel: 'error',
    }).verifyProvider()
  })
})
