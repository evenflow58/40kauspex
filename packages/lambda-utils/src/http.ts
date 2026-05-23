import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda'

export function json(statusCode: number, body: unknown): APIGatewayProxyResultV2 {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }
}

export function error(statusCode: number, message: string): APIGatewayProxyResultV2 {
  return json(statusCode, { error: message })
}

export function noContent(): APIGatewayProxyResultV2 {
  return { statusCode: 204, body: '' }
}

/**
 * Extract the Cognito `sub` claim set by the API Gateway JWT authorizer.
 * Returns null when the claim is absent — the caller maps that to a 401.
 */
export function getUserSub(event: APIGatewayProxyEventV2): string | null {
  const claims = (
    event.requestContext as {
      authorizer?: { jwt?: { claims?: Record<string, unknown> } }
    }
  ).authorizer?.jwt?.claims
  const sub = claims?.sub
  return typeof sub === 'string' && sub.length > 0 ? sub : null
}
