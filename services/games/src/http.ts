import type { APIGatewayProxyResultV2 } from 'aws-lambda'

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
