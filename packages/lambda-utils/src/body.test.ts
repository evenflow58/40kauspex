import { describe, it, expect } from 'vitest'
import { parseBody } from './body'

describe('parseBody', () => {
  it('parses a valid JSON object', () => {
    expect(parseBody('{"name":"test"}')).toEqual({ name: 'test' })
  })

  it('returns null for an absent body', () => {
    expect(parseBody(undefined)).toBeNull()
  })

  it('returns null for an empty string', () => {
    expect(parseBody('')).toBeNull()
  })

  it('returns null for invalid JSON', () => {
    expect(parseBody('not json')).toBeNull()
  })

  it('returns null for a JSON array (not an object)', () => {
    expect(parseBody('[1,2,3]')).toBeNull()
  })

  it('returns null for a JSON primitive', () => {
    expect(parseBody('"string"')).toBeNull()
    expect(parseBody('42')).toBeNull()
    expect(parseBody('null')).toBeNull()
  })
})
