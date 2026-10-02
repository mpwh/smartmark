import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useVFS } from '../vfs/context'
import { buildTree } from '../vfs/tree'
import { FileTree } from '../components/FileTree'
import { Editor, type EditorMode } from '../components/Editor'
import { ReadView } from '../components/ReadView'
import { WorkspaceSwitcher } from '../components/WorkspaceSwitcher'
import { ConflictError } from '../vfs/types'

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

  const [conflict, setConflict] = useState(false)
  const [saveError, setSaveError] = useState('')
  useEffect(() => {
    setConflict(false)
    setSaveError('')
  }, [file])

  const save = async (force = false) => {
    if (!file) return
    try {
      await vfs.write(file, draft.current, { force })
      qc.setQueryData(['file', file], draft.current)
      setDirty(false)
      setConflict(false)
      setSaveError('')
    } catch (e) {
      if (e instanceof ConflictError) setConflict(true)
      else setSaveError(e instanceof Error ? e.message : 'Save failed')
    }
  }
  // Autosave 1s after the last edit; paused while a conflict or error awaits the user.
  useEffect(() => {
    if (!dirty || conflict || saveError) return
    const t = setTimeout(() => save(), 1000)
    return () => clearTimeout(t)
  })

  // External changes: refresh the tree, and the open file unless the user has unsaved edits.
  const dirtyRef = useRef(dirty)
  dirtyRef.current = dirty
  useEffect(() => {
    if (!vfs.watch) return
    return vfs.watch((changed) => {
      qc.invalidateQueries({ queryKey: ['paths'] })
      if (file && changed.includes(file) && !dirtyRef.current) qc.invalidateQueries({ queryKey: ['file', file] })
    })
  }, [vfs, file, qc])

  const reloadFromDisk = async () => {
    setConflict(false)
    setDirty(false)
    await qc.invalidateQueries({ queryKey: ['file', file] })
  }

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
        <WorkspaceSwitcher />
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
            {conflict && (
              <div className="banner">
                This file changed on disk since you opened it.
                <button onClick={reloadFromDisk}>Discard mine, reload</button>
                <button onClick={() => save(true)}>Overwrite with mine</button>
              </div>
            )}
            {saveError && (
              <div className="banner">
                Save failed: {saveError}
                <button onClick={() => save()}>Retry</button>
              </div>
            )}
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
                onSave={() => save()}
              />
            )}
          </>
        )}
      </main>
    </div>
  )
}
