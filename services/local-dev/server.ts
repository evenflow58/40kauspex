import { createServer } from 'node:http'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda'

// Must be set before the dynamic imports below construct any DynamoDB clients.
process.env['TABLE_NAME'] ??= 'auspex40k-companion-local'
process.env['AWS_ENDPOINT_URL'] ??= 'http://localhost:8000'
process.env['AWS_ACCESS_KEY_ID'] ??= 'local'
process.env['AWS_SECRET_ACCESS_KEY'] ??= 'local'
process.env['AWS_REGION'] ??= 'us-east-1'

const PORT = 3003
const DEV_USER_SUB = 'local-dev-user'

type LambdaHandler = (event: APIGatewayProxyEventV2) => Promise<APIGatewayProxyResultV2>

interface Route {
  method: string
  pattern: RegExp
  routeKey: string
  paramNames: string[]
  handler: LambdaHandler
}

void (async () => {
  const { handler: gamesHandler } = await import('../games/src/handler')
  const { handler: armiesHandler } = await import('../armies/src/handler')
  const { handler: phaseGuideHandler } = await import('../phase-guide/src/handler')

  const routes: Route[] = [
    { method: 'GET',    pattern: /^\/games$/,                    routeKey: 'GET /games',                       paramNames: [],            handler: gamesHandler },
    { method: 'GET',    pattern: /^\/games\/([^/]+)\/phases$/,   routeKey: 'GET /games/{gameId}/phases',       paramNames: ['gameId'],    handler: gamesHandler },
    { method: 'GET',    pattern: /^\/games\/([^/]+)\/factions$/, routeKey: 'GET /games/{gameId}/factions',     paramNames: ['gameId'],    handler: gamesHandler },
    { method: 'GET',    pattern: /^\/factions\/([^/]+)\/units$/, routeKey: 'GET /factions/{factionId}/units',  paramNames: ['factionId'], handler: gamesHandler },
    { method: 'GET',    pattern: /^\/armies$/,                   routeKey: 'GET /armies',                      paramNames: [],            handler: armiesHandler },
    { method: 'POST',   pattern: /^\/armies$/,                   routeKey: 'POST /armies',                     paramNames: [],            handler: armiesHandler },
    { method: 'GET',    pattern: /^\/armies\/([^/]+)$/,          routeKey: 'GET /armies/{armyId}',             paramNames: ['armyId'],    handler: armiesHandler },
    { method: 'PUT',    pattern: /^\/armies\/([^/]+)$/,          routeKey: 'PUT /armies/{armyId}',             paramNames: ['armyId'],    handler: armiesHandler },
    { method: 'DELETE', pattern: /^\/armies\/([^/]+)$/,          routeKey: 'DELETE /armies/{armyId}',          paramNames: ['armyId'],    handler: armiesHandler },
    { method: 'GET',    pattern: /^\/phase-guide\/([^/]+)$/,     routeKey: 'GET /phase-guide/{armyId}',        paramNames: ['armyId'],    handler: phaseGuideHandler },
  ]

  function buildEvent(
    method: string,
    path: string,
    pathParams: Record<string, string>,
    routeKey: string,
    body: string | undefined,
  ): APIGatewayProxyEventV2 {
    return {
      version: '2.0',
      routeKey,
      rawPath: path,
      rawQueryString: '',
      headers: {},
      requestContext: {
        accountId: 'local',
        apiId: 'local',
        domainName: 'localhost',
        domainPrefix: 'localhost',
        http: { method, path, protocol: 'HTTP/1.1', sourceIp: '127.0.0.1', userAgent: 'local-dev' },
        requestId: 'local-req',
        routeKey,
        stage: '$default',
        time: new Date().toISOString(),
        timeEpoch: Date.now(),
        authorizer: { jwt: { claims: { sub: DEV_USER_SUB }, scopes: [] } },
      } as APIGatewayProxyEventV2['requestContext'],
      pathParameters: Object.keys(pathParams).length > 0 ? pathParams : undefined,
      isBase64Encoded: false,
      body,
    }
  }

  function readBody(req: IncomingMessage): Promise<string | undefined> {
    return new Promise((resolve, reject) => {
      let data = ''
      req.on('data', (chunk: Buffer) => { data += chunk })
      req.on('end', () => resolve(data || undefined))
      req.on('error', reject)
    })
  }

  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')

    if (req.method === 'OPTIONS') {
      res.writeHead(204)
      res.end()
      return
    }

    const method = req.method ?? 'GET'
    const path = new URL(req.url ?? '/', `http://localhost:${PORT}`).pathname
    const route = routes.find(r => r.method === method && r.pattern.test(path))

    if (!route) {
      res.writeHead(404, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Not found' }))
      return
    }

    const match = path.match(route.pattern)!
    const pathParams: Record<string, string> = {}
    route.paramNames.forEach((name, i) => { pathParams[name] = match[i + 1] })

    try {
      const body = await readBody(req)
      const event = buildEvent(method, path, pathParams, route.routeKey, body)
      const result = await route.handler(event) as { statusCode: number; headers?: Record<string, string>; body: string }
      res.writeHead(result.statusCode, { 'Content-Type': 'application/json', ...result.headers })
      res.end(result.body)
    } catch (err) {
      console.error(err)
      res.writeHead(500, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Internal server error' }))
    }
  })

  server.listen(PORT, () => {
    console.log(`Local API  http://localhost:${PORT}`)
    console.log(`DynamoDB   ${process.env['AWS_ENDPOINT_URL']}  table=${process.env['TABLE_NAME']}`)
    console.log(`Auth sub   ${DEV_USER_SUB}`)
  })
})()
