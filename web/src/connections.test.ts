import { describe, expect, it } from 'vitest'
import { parseConnectHash } from './connections'

describe('parseConnectHash', () => {
  it('parses the agent link', () => {
    expect(parseConnectHash('#connect=http%3A%2F%2F127.0.0.1%3A7777&token=abc123')).toEqual({
      url: 'http://127.0.0.1:7777',
      token: 'abc123',
    })
  })
  it('rejects missing or non-http values', () => {
    expect(parseConnectHash('')).toBeNull()
    expect(parseConnectHash('#connect=javascript%3Aalert(1)&token=x')).toBeNull()
    expect(parseConnectHash('#connect=http%3A%2F%2Fa')).toBeNull()
  })
})
