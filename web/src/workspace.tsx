import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { VFSContext } from './vfs/context'
import { sampleFS } from './vfs/memory'
import { createAgentFS } from './vfs/agent'
import {
  getActiveId,
  loadConnections,
  newId,
  parseConnectHash,
  saveConnections,
  setActiveId,
  type Connection,
} from './connections'

interface WorkspaceCtx {
  connections: Connection[]
  activeId: string | null
  select(id: string | null): void
  connect(url: string, token: string): Promise<void>
  remove(id: string): void
}

const Ctx = createContext<WorkspaceCtx | null>(null)
export const useWorkspaces = () => {
  const v = useContext(Ctx)
  if (!v) throw new Error('WorkspaceProvider missing')
  return v
}

/** Chooses the active VFS (demo or a connected agent) and consumes #connect= links. */
export function WorkspaceProvider({ children }: { children: (key: string) => ReactNode }) {
  const qc = useQueryClient()
  const [connections, setConnections] = useState<Connection[]>(loadConnections)
  const [activeId, setActive] = useState<string | null>(getActiveId)

  const update = useCallback((next: Connection[]) => {
    setConnections(next)
    saveConnections(next)
  }, [])

  const select = useCallback(
    (id: string | null) => {
      qc.clear()
      setActiveId(id)
      setActive(id)
      history.replaceState(null, '', location.pathname) // drop ?file= from the previous workspace
    },
    [qc],
  )

  const connect = useCallback(
    async (url: string, token: string) => {
      const fs = createAgentFS({ url, token })
      const info = await fs.info() // throws on bad URL/token, so nothing bad is saved
      const existing = connections.find((c) => c.url === url && c.token === token)
      const conn: Connection = existing ?? { id: newId(), name: info.name, kind: 'agent', url, token }
      if (!existing) update([...connections, conn])
      select(conn.id)
    },
    [connections, update, select],
  )

  const remove = useCallback(
    (id: string) => {
      update(connections.filter((c) => c.id !== id))
      if (activeId === id) select(null)
    },
    [connections, activeId, update, select],
  )

  // Consume the link printed by `smartmark-agent`.
  useEffect(() => {
    const link = parseConnectHash(location.hash)
    if (!link) return
    history.replaceState(null, '', location.pathname + location.search)
    connect(link.url, link.token).catch((e) => alert(`Could not connect to the agent: ${e.message}`))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const active = connections.find((c) => c.id === activeId)
  const vfs = useMemo(() => (active ? createAgentFS(active) : sampleFS()), [active])
  const value = useMemo(() => ({ connections, activeId, select, connect, remove }), [connections, activeId, select, connect, remove])

  return (
    <Ctx.Provider value={value}>
      <VFSContext.Provider value={vfs}>{children(active?.id ?? 'demo')}</VFSContext.Provider>
    </Ctx.Provider>
  )
}
