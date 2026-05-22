import { describe, it, expect } from 'vitest'
import type { APIGatewayProxyEventV2 } from 'aws-lambda'
import { handler } from './handler'

/**
 * The health handler ignores its event entirely, so an empty object cast to
 * the event type is a sufficient and honest stand-in for the test.
 */
const emptyEvent = {} as APIGatewayProxyEventV2

describe('health handler', () => {
  it('returns a 200 with an ok status body', async () => {
    const result = await handler(emptyEvent)

    expect(result).toEqual({
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: '{"status":"ok"}',
    })
  })

  it('returns JSON-parseable body with status ok', async () => {
    const result = await handler(emptyEvent)

    // Narrow the APIGatewayProxyResultV2 union to the structured form.
    if (typeof result === 'string' || result === undefined) {
      throw new Error('expected a structured proxy result')
    }

    expect(JSON.parse(result.body ?? '')).toEqual({ status: 'ok' })
  })
})
