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

const TEST_SUB = 'pact-test-sub'
const ARMY_ID = 'army-1'
const GAME_ID = 'wh40k-10e'
const PACTS_DIR = path.resolve(__dirname, '../../../pacts')
let port: number

function buildEvent(armyId: string): APIGatewayProxyEventV2 {
  return {
    version: '2.0',
    routeKey: 'GET /phase-guide/{armyId}',
    rawPath: `/phase-guide/${armyId}`,
    rawQueryString: '',
    headers: {},
    requestContext: {
      accountId: 'test',
      apiId: 'test',
      domainName: 'localhost',
      domainPrefix: 'localhost',
      http: { method: 'GET', path: '', protocol: 'HTTP/1.1', sourceIp: '127.0.0.1', userAgent: 'test' },
      requestId: 'test',
      routeKey: 'GET /phase-guide/{armyId}',
      stage: '$default',
      time: '',
      timeEpoch: 0,
      authorizer: { jwt: { claims: { sub: TEST_SUB }, scopes: [] } },
    } as APIGatewayProxyEventV2['requestContext'],
    pathParameters: { armyId },
    isBase64Encoded: false,
  }
}

const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
  const pathname = new URL(req.url ?? '/', 'http://localhost').pathname
  const match = pathname.match(/^\/phase-guide\/([^/]+)$/)

  if (!match) {
    res.writeHead(404, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'Not found' }))
    return
  }

  try {
    const result = await handler(buildEvent(match[1])) as {
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

describe('phase-guide-service pact provider verification', () => {
  beforeAll(() => new Promise<void>((resolve) => {
    server.listen(0, () => {
      port = (server.address() as AddressInfo).port
      resolve()
    })
  }))
  afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())))

  it('satisfies the mfe-companion contract', async () => {
    await new Verifier({
      provider: 'phase-guide-service',
      providerBaseUrl: `http://localhost:${port}`,
      pactUrls: [path.join(PACTS_DIR, 'mfe-companion-phase-guide-service.json')],
      stateHandlers: {
        'user pact-test-sub owns army army-1 with infantry units': async () => {
          ddbMock.reset()

          ddbMock.on(GetCommand).resolves({
            Item: {
              armyId: ARMY_ID,
              name: 'Green Tide',
              gameId: GAME_ID,
              factionName: 'Orks',
            },
          })

          // getArmyUnits queries by ARMY#<id> partition; getPhases queries by
          // GAME#<id> partition. Match on ExpressionAttributeValues to return
          // the right items to each concurrent QueryCommand call.
          ddbMock
            .on(QueryCommand, { ExpressionAttributeValues: { ':pk': `ARMY#${ARMY_ID}` } })
            .resolves({
              Items: [
                {
                  PK: `ARMY#${ARMY_ID}`,
                  SK: 'UNIT#ork-boyz#entry-1',
                  entryId: 'entry-1',
                  unitName: 'Boyz',
                  keywords: ['INFANTRY', 'CORE'],
                },
              ],
            })

          ddbMock
            .on(QueryCommand, { ExpressionAttributeValues: { ':pk': `GAME#${GAME_ID}` } })
            .resolves({
              Items: [
                {
                  order: 1,
                  name: 'Command Phase',
                  description: 'Issue orders.',
                  keyActions: ['Issue Strategic Ploy'],
                  relevantKeywords: ['INFANTRY'],
                },
              ],
            })
        },
      },
      logLevel: 'error',
    }).verifyProvider()
  })
})
