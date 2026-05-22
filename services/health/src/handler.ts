import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda'

/**
 * Health check handler for the 40K Auspex HTTP API.
 *
 * Exposed publicly (no JWT authorizer) at `GET /health` so external uptime
 * checks and the front-end can verify the API tier is reachable without a
 * signed-in session. Returns a fixed `{ status: 'ok' }` payload — there is no
 * downstream dependency to probe yet.
 */
export const handler = async (
  _event: APIGatewayProxyEventV2
): Promise<APIGatewayProxyResultV2> => ({
  statusCode: 200,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ status: 'ok' }),
})
