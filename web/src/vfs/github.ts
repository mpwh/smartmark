import { ConflictError, type VFS } from './types'

export interface GitHubConfig {
  owner: string
  repo: string
  branch: string
  token: string
  /** Override for tests. */
  api?: string
}

export class GitHubError extends Error {
  constructor(public status: number, message: string) {
    super(message)
  }
}

const POLL_MS = 30_000

/** Encode each path segment, keeping the slashes. */
const encPath = (p: string) => p.split('/').map(encodeURIComponent).join('/')

export function toBase64(bytes: Uint8Array): string {
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(s)
}

async function errorOf(res: Response): Promise<GitHubError> {
  let msg = res.statusText
  try {
    msg = (await res.json()).message ?? msg
  } catch {
    /* not json */
  }
  return new GitHubError(res.status, msg)
}

/** Validates access and returns repo metadata (used when connecting). */
export async function fetchRepo(owner: string, repo: string, token: string, api = 'https://api.github.com') {
  const res = await fetch(`${api}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' },
  })
  if (!res.ok) throw await errorOf(res)
  const r = await res.json()
  return { fullName: r.full_name as string, defaultBranch: r.default_branch as string, canPush: !!r.permissions?.push }
}

export function createGitHubFS(cfg: GitHubConfig): VFS {
  const api = cfg.api ?? 'https://api.github.com'
  const base = `${api}/repos/${encodeURIComponent(cfg.owner)}/${encodeURIComponent(cfg.repo)}`
  const auth = { Authorization: `Bearer ${cfg.token}` }
  const shas = new Map<string, string>() // path -> blob sha (what we last saw or wrote)
  let headSha: string | null = null
  let refEtag: string | null = null
  let refreshing: Promise<string[]> | null = null
  let writeQueue: Promise<unknown> = Promise.resolve()

  async function gh(path: string, init?: RequestInit & { accept?: string }) {
    const res = await fetch(`${base}${path}`, {
      ...init,
      headers: { ...auth, Accept: init?.accept ?? 'application/vnd.github+json', ...(init?.headers as Record<string, string>) },
    })
    return res
  }

  /** Re-read the branch head; when it moved, reload the tree and return the paths whose blob changed. */
  function refresh(): Promise<string[]> {
    refreshing ??= (async () => {
      try {
        const res = await gh(`/git/ref/heads/${encPath(cfg.branch)}`, {
          headers: refEtag ? { 'If-None-Match': refEtag } : {},
        })
        if (res.status === 304) return []
        if (!res.ok) throw await errorOf(res)
        refEtag = res.headers.get('ETag')
        const ref = await res.json()
        const commit: string = ref.object.sha
        if (commit === headSha) return []
        const tr = await gh(`/git/trees/${commit}?recursive=1`)
        if (!tr.ok) throw await errorOf(tr)
        const tree = await tr.json()
        if (tree.truncated) throw new GitHubError(0, 'Repository is too large to list (tree truncated).')
        const next = new Map<string, string>()
        for (const e of tree.tree as { path: string; type: string; sha: string }[]) {
          if (e.type === 'blob') next.set(e.path, e.sha)
        }
        const changed: string[] = []
        for (const [p, sha] of next) if (shas.get(p) !== sha) changed.push(p)
        for (const p of shas.keys()) if (!next.has(p)) changed.push(p)
        shas.clear()
        for (const [p, sha] of next) shas.set(p, sha)
        // The first load is not a "change".
        const first = headSha === null
        headSha = commit
        return first ? [] : changed
      } finally {
        refreshing = null
      }
    })()
    return refreshing
  }

  async function putFile(path: string, content: string, sha: string | undefined) {
    const res = await gh(`/contents/${encPath(path)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: `Update ${path}`,
        content: toBase64(new TextEncoder().encode(content)),
        branch: cfg.branch,
        ...(sha ? { sha } : {}),
      }),
    })
    if (!res.ok) {
      const err = await errorOf(res)
      // Stale or missing sha means someone else changed the file; anything else (protected branch, ref race) is a plain error.
      if ((res.status === 409 && /does not match/i.test(err.message)) || (res.status === 422 && /sha/i.test(err.message)))
        throw new ConflictError(path)
      throw err
    }
    const body = await res.json()
    shas.set(path, body.content.sha)
  }

  async function currentSha(path: string): Promise<string | undefined> {
    const res = await gh(`/contents/${encPath(path)}?ref=${encodeURIComponent(cfg.branch)}`)
    if (res.status === 404) return undefined
    if (!res.ok) throw await errorOf(res)
    return (await res.json()).sha
  }

  return {
    autosave: false,
    async listAll() {
      await refresh()
      return [...shas.keys()].sort()
    },
    async read(path) {
      if (!shas.has(path)) await refresh()
      const sha = shas.get(path)
      if (!sha) throw new GitHubError(404, `${path} not found`)
      const res = await gh(`/git/blobs/${sha}`, { accept: 'application/vnd.github.raw+json' })
      if (!res.ok) throw await errorOf(res)
      return new TextDecoder('utf-8', { ignoreBOM: true }).decode(await res.arrayBuffer())
    },
    write(path, content, opts) {
      // One PUT in flight at a time: concurrent commits on a branch race on the ref.
      const run = writeQueue.then(async () => {
        const sha = opts?.force ? await currentSha(path) : shas.get(path)
        await putFile(path, content, sha)
      })
      writeQueue = run.catch(() => {})
      return run
    },
    watch(onChange) {
      const tick = () => {
        if (typeof document !== 'undefined' && document.hidden) return
        refresh()
          .then((changed) => changed.length && onChange(changed))
          .catch(() => {}) // transient network/API errors: try again next tick
      }
      const id = setInterval(tick, POLL_MS)
      return () => clearInterval(id)
    },
  }
}
