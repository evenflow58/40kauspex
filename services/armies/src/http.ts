import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyResultV2,
} from 'aws-lambda'

/** Build a JSON API Gateway proxy result with the given status and payload. */
export function json(
  statusCode: number,
  body: unknown
): APIGatewayProxyResultV2 {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }
}

/** Build a JSON error response of the shape `{ error: string }`. */
export function error(
  statusCode: number,
  message: string
): APIGatewayProxyResultV2 {
  return json(statusCode, { error: message })
}

/** A 204 No Content response (used by DELETE). */
export function noContent(): APIGatewayProxyResultV2 {
  return { statusCode: 204, body: '' }
}

/**
 * Extract the authenticated user's Cognito `sub` from the request context.
 *
 * The API Gateway JWT authorizer validates the `Authorization: Bearer` token
 * and exposes its claims at `event.requestContext.authorizer.jwt.claims`.
 * Returns `null` when the claim is absent — the caller maps that to a 401.
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
