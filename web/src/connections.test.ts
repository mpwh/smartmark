import { describe, expect, it } from 'vitest'
import { label, parseConnectHash, parseRepo } from './connections'

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

describe('parseRepo / label', () => {
  it('accepts owner/repo and github URLs', () => {
    expect(parseRepo('mpwh/smartmark')).toEqual({ owner: 'mpwh', repo: 'smartmark' })
    expect(parseRepo('https://github.com/mpwh/smartmark.git')).toEqual({ owner: 'mpwh', repo: 'smartmark' })
    expect(parseRepo('nope')).toBeNull()
    expect(parseRepo('a/b/c')).toBeNull()
  })
  it('labels both kinds', () => {
    expect(label({ id: '1', name: 'n', kind: 'github', owner: 'o', repo: 'r', branch: 'main', token: 't' })).toBe('o/r (main)')
    expect(label({ id: '2', name: 'notes', kind: 'agent', url: 'http://127.0.0.1:7777', token: 't' })).toBe('notes (127.0.0.1:7777)')
  })
})
