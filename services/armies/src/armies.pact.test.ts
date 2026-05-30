import { createServer } from 'node:http'
import type { AddressInfo, IncomingMessage, ServerResponse } from 'node:http'
import path from 'path'
import { describe, it, beforeAll, afterAll } from 'vitest'
import { Verifier } from '@pact-foundation/pact'
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

const TEST_SUB = 'pact-test-sub'
const ARMY_ID = 'army-1'
const PACTS_DIR = path.resolve(__dirname, '../../../pacts')
let port: number

const ARMY_ITEM = {
  PK: `USER#${TEST_SUB}`,
  SK: `ARMY#${ARMY_ID}`,
  armyId: ARMY_ID,
  userId: TEST_SUB,
  name: 'Green Tide',
  gameId: 'wh40k-10e',
  factionId: 'orks',
  factionName: 'Orks',
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
}

const UNIT_ITEM = {
  PK: `ARMY#${ARMY_ID}`,
  SK: 'UNIT#ork-boyz#entry-1',
  entryId: 'entry-1',
  unitId: 'ork-boyz',
  unitName: 'Boyz',
  keywords: ['INFANTRY', 'CORE'],
  movement: 6,
  hasRanged: true,
  hasMelee: true,
  battlefieldRole: 'Battleline',
}

const routes = [
  { method: 'GET', pattern: /^\/armies$/, routeKey: 'GET /armies', params: [] as string[] },
  { method: 'POST', pattern: /^\/armies$/, routeKey: 'POST /armies', params: [] },
  { method: 'GET', pattern: /^\/armies\/([^/]+)$/, routeKey: 'GET /armies/{armyId}', params: ['armyId'] },
  { method: 'PUT', pattern: /^\/armies\/([^/]+)$/, routeKey: 'PUT /armies/{armyId}', params: ['armyId'] },
  { method: 'DELETE', pattern: /^\/armies\/([^/]+)$/, routeKey: 'DELETE /armies/{armyId}', params: ['armyId'] },
]

function readBody(req: IncomingMessage): Promise<string | undefined> {
  return new Promise((resolve, reject) => {
    let data = ''
    req.on('data', (chunk: Buffer) => { data += chunk })
    req.on('end', () => resolve(data || undefined))
    req.on('error', reject)
  })
}

function buildEvent(
  routeKey: string,
  pathParams: Record<string, string>,
  body: string | undefined,
  method: string
): APIGatewayProxyEventV2 {
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
      http: { method, path: '', protocol: 'HTTP/1.1', sourceIp: '127.0.0.1', userAgent: 'test' },
      requestId: 'test',
      routeKey,
      stage: '$default',
      time: '',
      timeEpoch: 0,
      // The armies handler reads the sub from the JWT authorizer claim.
      // Pact verifies response shape, not auth — inject a fixed test sub.
      authorizer: { jwt: { claims: { sub: TEST_SUB }, scopes: [] } },
    } as APIGatewayProxyEventV2['requestContext'],
    pathParameters: Object.keys(pathParams).length > 0 ? pathParams : undefined,
    isBase64Encoded: false,
    body,
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
    const body = await readBody(req)
    const result = await handler(buildEvent(route.routeKey, pathParams, body, method)) as {
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

describe('armies-service pact provider verification', () => {
  beforeAll(() => new Promise<void>((resolve) => {
    server.listen(0, () => {
      port = (server.address() as AddressInfo).port
      resolve()
    })
  }))
  afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())))

  it('satisfies the mfe-companion contract', async () => {
    await new Verifier({
      provider: 'armies-service',
      providerBaseUrl: `http://localhost:${port}`,
      pactUrls: [path.join(PACTS_DIR, 'mfe-companion-armies-service.json')],
      stateHandlers: {
        'user pact-test-sub has armies': async () => {
          ddbMock.reset()
          ddbMock.on(QueryCommand).resolves({ Items: [ARMY_ITEM] })
        },

        'user pact-test-sub can create armies': async () => {
          ddbMock.reset()
          ddbMock.on(PutCommand).resolves({})
          ddbMock.on(BatchWriteCommand).resolves({ UnprocessedItems: {} })
        },

        'user pact-test-sub owns army army-1': async () => {
          ddbMock.reset()
          ddbMock.on(GetCommand).resolves({ Item: ARMY_ITEM })
          ddbMock.on(PutCommand).resolves({})
          ddbMock.on(QueryCommand).resolves({ Items: [UNIT_ITEM] })
          ddbMock.on(BatchWriteCommand).resolves({ UnprocessedItems: {} })
          ddbMock.on(DeleteCommand).resolves({})
        },
      },
      logLevel: 'error',
    }).verifyProvider()
  })
})
