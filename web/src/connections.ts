export type Connection =
  | { id: string; name: string; kind: 'agent'; url: string; token: string }
  | { id: string; name: string; kind: 'github'; owner: string; repo: string; branch: string; token: string }

/** Short human label shown in the workspace switcher. */
export function label(c: Connection): string {
  if (c.kind === 'github') return `${c.owner}/${c.repo} (${c.branch})`
  try {
    return `${c.name} (${new URL(c.url).host})`
  } catch {
    return c.name
  }
}

/** Accepts "owner/repo" or a github.com URL. */
export function parseRepo(input: string): { owner: string; repo: string } | null {
  const m = input.trim().replace(/^https?:\/\/github\.com\//, '').replace(/\.git$/, '').replace(/\/+$/, '').match(/^([\w.-]+)\/([\w.-]+)$/)
  return m ? { owner: m[1], repo: m[2] } : null
}

const KEY = 'smartmark.connections'
const ACTIVE = 'smartmark.active'

export function loadConnections(): Connection[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '[]')
    return Array.isArray(v) ? v : []
  } catch {
    return []
  }
}

export function saveConnections(list: Connection[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list))
  } catch {
    /* storage unavailable: connections last for this tab only */
  }
}

export const getActiveId = (): string | null => {
  try {
    return localStorage.getItem(ACTIVE)
  } catch {
    return null
  }
}

export function setActiveId(id: string | null) {
  try {
    if (id) localStorage.setItem(ACTIVE, id)
    else localStorage.removeItem(ACTIVE)
  } catch {
    /* ignore */
  }
}

/**
 * Parse `#connect=<agent url>&token=<token>` from a location hash (the link the agent prints).
 * The token lives in the fragment so it is never sent to any server.
 */
export function parseConnectHash(hash: string): { url: string; token: string } | null {
  const p = new URLSearchParams(hash.replace(/^#/, ''))
  const url = p.get('connect')
  const token = p.get('token')
  if (!url || !token) return null
  try {
    const u = new URL(url)
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
    return { url: u.origin, token }
  } catch {
    return null
  }
}

export const newId = () => Math.random().toString(36).slice(2, 10)
