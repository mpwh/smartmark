import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createGitHubFS, toBase64 } from './github'
import { ConflictError } from './types'

/** Minimal in-memory GitHub REST fake covering the endpoints GitHubFS uses. */
function fakeGitHub(initial: Record<string, Uint8Array | string>) {
  const enc = (v: Uint8Array | string) => (typeof v === 'string' ? new TextEncoder().encode(v) : v)
  let n = 0
  const blobs = new Map<string, Uint8Array>()
  const files = new Map<string, string>() // path -> blob sha
  const addBlob = (b: Uint8Array) => {
    const sha = `blob${++n}`
    blobs.set(sha, b)
    return sha
  }
  let head = 'c0'
  const commit = () => (head = `c${++n}`)
  for (const [p, v] of Object.entries(initial)) files.set(p, addBlob(enc(v)))
  const calls: string[] = []
  let truncated = false
  let putStatus: { status: number; message: string } | null = null

  const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } })

  const fetchImpl = async (url: string, init?: RequestInit) => {
    const u = new URL(url)
    const path = decodeURIComponent(u.pathname.replace('/repos/o/r', ''))
    const method = init?.method ?? 'GET'
    const h = (init?.headers ?? {}) as Record<string, string>
    calls.push(`${method} ${path}`)
    if (path === '/git/ref/heads/main') {
      const etag = `"${head}"`
      if (h['If-None-Match'] === etag) return new Response(null, { status: 304 })
      return json({ object: { sha: head } }, 200, { ETag: etag })
    }
    if (path.startsWith('/git/trees/')) {
      return json({ truncated, tree: [...files].map(([p, sha]) => ({ path: p, type: 'blob', sha })).concat([{ path: 'sub', type: 'commit', sha: 'x' }]) })
    }
    if (path.startsWith('/git/blobs/')) {
      const b = blobs.get(path.slice('/git/blobs/'.length))
      return b ? new Response(new Uint8Array(b)) : json({ message: 'Not Found' }, 404)
    }
    if (path.startsWith('/contents/')) {
      const p = path.slice('/contents/'.length)
      if (method === 'GET') return files.has(p) ? json({ sha: files.get(p) }) : json({ message: 'Not Found' }, 404)
      if (putStatus) return json({ message: putStatus.message }, putStatus.status)
      const body = JSON.parse(init!.body as string)
      const cur = files.get(p)
      if (cur && body.sha !== cur) return json({ message: `${p} does not match ${body.sha}` }, 409)
      if (cur && !body.sha) return json({ message: 'Invalid request.\n\n"sha" wasn\'t supplied.' }, 422)
      const bytes = Uint8Array.from(atob(body.content), (c) => c.charCodeAt(0))
      const sha = addBlob(bytes)
      files.set(p, sha)
      commit()
      return json({ content: { sha }, commit: { sha: head } }, cur ? 200 : 201)
    }
    return json({ message: 'unexpected ' + path }, 500)
  }
  return {
    fetchImpl,
    calls,
    blobs,
    files,
    /** Simulate a commit made elsewhere (github.com, another machine). */
    externalWrite(p: string, v: string) {
      files.set(p, addBlob(enc(v)))
      commit()
    },
    setTruncated: (v: boolean) => (truncated = v),
    failPut: (s: { status: number; message: string } | null) => (putStatus = s),
  }
}

let gh: ReturnType<typeof fakeGitHub>
const fsFor = () => createGitHubFS({ owner: 'o', repo: 'r', branch: 'main', token: 't', api: 'https://api.test' })

beforeEach(() => {
  gh = fakeGitHub({ 'a.md': '# a', 'notes/b.md': 'b' })
  vi.stubGlobal('fetch', (url: string, init?: RequestInit) => gh.fetchImpl(url, init))
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('GitHubFS', () => {
  it('lists blobs only and disables autosave', async () => {
    const fs = fsFor()
    expect(fs.autosave).toBe(false)
    expect(await fs.listAll()).toEqual(['a.md', 'notes/b.md'])
  })

  it('round-trips UTF-8 with emoji and a BOM byte-for-byte', async () => {
    const text = '﻿# héllo 👋\r\n'
    gh = fakeGitHub({ 'u.md': text })
    const fs = fsFor()
    await fs.listAll()
    const read = await fs.read('u.md')
    expect(read).toBe(text)
    await fs.write('u.md', read)
    const saved = gh.blobs.get(gh.files.get('u.md')!)!
    expect([...saved]).toEqual([...new TextEncoder().encode(text)])
  })

  it('encodes large content in chunks', () => {
    const big = new Uint8Array(200_000).fill(65)
    expect(atob(toBase64(big)).length).toBe(200_000)
  })

  it('maps a stale sha to ConflictError, and force overwrites', async () => {
    const fs = fsFor()
    await fs.listAll()
    await fs.read('a.md')
    gh.externalWrite('a.md', 'theirs')
    await expect(fs.write('a.md', 'mine')).rejects.toBeInstanceOf(ConflictError)
    await fs.write('a.md', 'mine', { force: true })
    expect(new TextDecoder().decode(gh.blobs.get(gh.files.get('a.md')!))).toBe('mine')
  })

  it('treats other 409/422 as plain errors', async () => {
    const fs = fsFor()
    await fs.listAll()
    gh.failPut({ status: 409, message: 'Reference update failed' })
    const err = await fs.write('a.md', 'x').catch((e) => e)
    expect(err).not.toBeInstanceOf(ConflictError)
    expect(err.message).toBe('Reference update failed')
  })

  it('serializes writes', async () => {
    const fs = fsFor()
    await fs.listAll()
    await Promise.all([fs.write('a.md', '1'), fs.write('a.md', '2')])
    expect(new TextDecoder().decode(gh.blobs.get(gh.files.get('a.md')!))).toBe('2')
  })

  it('errors on a truncated tree', async () => {
    gh.setTruncated(true)
    await expect(fsFor().listAll()).rejects.toThrow(/too large/)
  })

  describe('watch', () => {
    const poll = async () => {
      await vi.advanceTimersByTimeAsync(30_000)
    }

    it('emits nothing on 304, nothing for our own write, and foreign changes by path', async () => {
      vi.useFakeTimers()
      const fs = fsFor()
      await fs.listAll()
      const seen: string[][] = []
      const stop = fs.watch!((p) => seen.push(p))

      await poll()
      expect(gh.calls.at(-1)).toBe('GET /git/ref/heads/main') // 304, no tree fetch
      expect(seen).toEqual([])

      await fs.write('a.md', 'mine')
      await poll()
      expect(seen).toEqual([])

      gh.externalWrite('notes/b.md', 'theirs')
      gh.externalWrite('new.md', 'n')
      await poll()
      expect(seen).toEqual([['notes/b.md', 'new.md']])
      stop()
    })
  })
})
