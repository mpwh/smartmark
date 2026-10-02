import { ConflictError, type VFS } from './types'

export interface AgentConfig {
  /** e.g. http://127.0.0.1:7777 */
  url: string
  token: string
}

export class AgentError extends Error {
  constructor(public status: number, message: string) {
    super(message)
  }
}

export function createAgentFS({ url, token }: AgentConfig): VFS & { info(): Promise<{ name: string; version: string }> } {
  const base = url.replace(/\/+$/, '')
  const etags = new Map<string, string>()
  const headers = (extra?: Record<string, string>) => ({ Authorization: `Bearer ${token}`, ...extra })
  const q = (p: string) => encodeURIComponent(p)

  async function check(res: Response): Promise<Response> {
    if (res.ok) return res
    let msg = res.statusText
    try {
      msg = (await res.json()).error ?? msg
    } catch {
      /* not json */
    }
    throw new AgentError(res.status, msg)
  }

  return {
    async info() {
      return (await check(await fetch(`${base}/v1/info`, { headers: headers() }))).json()
    },
    async listAll() {
      const res = await check(await fetch(`${base}/v1/files`, { headers: headers() }))
      return (await res.json()).files as string[]
    },
    async read(path) {
      const res = await check(await fetch(`${base}/v1/file?path=${q(path)}`, { headers: headers() }))
      const etag = res.headers.get('ETag')
      if (etag) etags.set(path, etag)
      return res.text()
    },
    async write(path, content, opts) {
      const etag = etags.get(path)
      const res = await fetch(`${base}/v1/file?path=${q(path)}`, {
        method: 'PUT',
        headers: headers(!opts?.force && etag ? { 'If-Match': etag } : undefined),
        body: content,
      })
      if (res.status === 412) throw new ConflictError(path)
      await check(res)
      const next = res.headers.get('ETag')
      if (next) etags.set(path, next)
    },
    watch(onChange) {
      // EventSource cannot send headers, so the agent accepts ?token= on this endpoint only.
      const es = new EventSource(`${base}/v1/events?token=${q(token)}`)
      es.addEventListener('change', (e) => {
        try {
          onChange(JSON.parse((e as MessageEvent).data))
        } catch {
          onChange([])
        }
      })
      return () => es.close()
    },
  }
}
