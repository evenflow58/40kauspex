import { describe, it, expect } from 'vitest'
import type { APIGatewayProxyEventV2 } from 'aws-lambda'
import { json, error, noContent, getUserSub } from './http'

describe('json', () => {
  it('returns the status code and JSON-encoded body', () => {
    const result = json(200, { id: '1' })
    expect(result.statusCode).toBe(200)
    expect(result.body).toBe(JSON.stringify({ id: '1' }))
    expect((result.headers as Record<string, string>)['Content-Type']).toBe('application/json')
  })
})

describe('error', () => {
  it('wraps the message in an error envelope', () => {
    const result = error(400, 'bad input')
    expect(result.statusCode).toBe(400)
    expect(JSON.parse(result.body ?? '')).toEqual({ error: 'bad input' })
  })
})

describe('noContent', () => {
  it('returns 204 with an empty body', () => {
    const result = noContent()
    expect(result.statusCode).toBe(204)
    expect(result.body).toBe('')
  })
})

describe('getUserSub', () => {
  function makeEvent(sub: unknown): APIGatewayProxyEventV2 {
    return {
      requestContext: {
        authorizer: { jwt: { claims: { sub } } },
      },
    } as unknown as APIGatewayProxyEventV2
  }

  it('returns the sub claim when present', () => {
    expect(getUserSub(makeEvent('user-123'))).toBe('user-123')
  })

  it('returns null when sub is missing', () => {
    expect(getUserSub(makeEvent(undefined))).toBeNull()
  })

  it('returns null when sub is an empty string', () => {
    expect(getUserSub(makeEvent(''))).toBeNull()
  })

  it('returns null when there is no authorizer', () => {
    const event = { requestContext: {} } as unknown as APIGatewayProxyEventV2
    expect(getUserSub(event)).toBeNull()
  })
})
