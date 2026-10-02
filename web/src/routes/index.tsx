import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useVFS } from '../vfs/context'
import { buildTree } from '../vfs/tree'
import { FileTree } from '../components/FileTree'
import { Editor, type EditorMode } from '../components/Editor'
import { ReadView } from '../components/ReadView'

type View = 'live' | 'source' | 'read'

export const Route = createFileRoute('/')({
  validateSearch: (s: Record<string, unknown>): { file?: string; view?: View } => ({
    file: typeof s.file === 'string' ? s.file : undefined,
    view: s.view === 'source' || s.view === 'read' ? s.view : undefined,
  }),
  component: Workspace,
})

function Workspace() {
  const vfs = useVFS()
  const qc = useQueryClient()
  const { file, view = 'live' } = Route.useSearch()
  const navigate = useNavigate({ from: '/' })
  const [showOthers, setShowOthers] = useState(false)

  const paths = useQuery({ queryKey: ['paths'], queryFn: () => vfs.listAll() })
  const tree = useMemo(() => buildTree(paths.data ?? [], showOthers), [paths.data, showOthers])
  const content = useQuery({
    queryKey: ['file', file],
    queryFn: () => vfs.read(file!),
    enabled: !!file,
    staleTime: Infinity,
  })

  const draft = useRef('')
  const [dirty, setDirty] = useState(false)
  useEffect(() => {
    draft.current = content.data ?? ''
    setDirty(false)
  }, [file, content.data])

  const save = async () => {
    if (!file) return
    await vfs.write(file, draft.current)
    qc.setQueryData(['file', file], draft.current)
    setDirty(false)
  }
  // Autosave 1s after the last edit.
  useEffect(() => {
    if (!dirty) return
    const t = setTimeout(save, 1000)
    return () => clearTimeout(t)
  })

  const setView = (v: View) => navigate({ search: (s) => ({ ...s, view: v === 'live' ? undefined : v }) })

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="side-head">
          <strong>Smartmark</strong>
          <label>
            <input type="checkbox" checked={showOthers} onChange={(e) => setShowOthers(e.target.checked)} /> other files
          </label>
        </div>
        <FileTree nodes={tree} selected={file} onOpen={(f) => navigate({ search: (s) => ({ ...s, file: f }) })} />
      </aside>
      <main className="main">
        {!file ? (
          <p className="empty">Select a markdown file.</p>
        ) : (
          <>
            <header className="toolbar">
              <span className="title">
                {file}
                {dirty ? ' •' : ''}
              </span>
              <div className="seg">
                {(['live', 'source', 'read'] as View[]).map((v) => (
                  <button key={v} className={v === view ? 'on' : ''} onClick={() => setView(v)}>
                    {v === 'live' ? 'Edit' : v === 'source' ? 'Source' : 'Read'}
                  </button>
                ))}
              </div>
            </header>
            {content.isPending ? (
              <p className="empty">Loading…</p>
            ) : content.error ? (
              <p className="empty">Failed to open file.</p>
            ) : view === 'read' ? (
              <ReadView text={dirty ? draft.current : content.data!} />
            ) : (
              <Editor
                docKey={file}
                value={dirty ? draft.current : content.data!}
                mode={view as EditorMode}
                onChange={(t) => {
                  draft.current = t
                  setDirty(true)
                }}
                onSave={save}
              />
            )}
          </>
        )}
      </main>
    </div>
  )
}
