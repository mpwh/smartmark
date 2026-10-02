import { useState } from 'react'
import { useWorkspaces } from '../workspace'

export function WorkspaceSwitcher() {
  const { connections, activeId, select, connect, remove } = useWorkspaces()
  const [adding, setAdding] = useState(false)
  const [url, setUrl] = useState('http://127.0.0.1:7777')
  const [token, setToken] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setErr('')
    try {
      await connect(url.trim(), token.trim())
      setAdding(false)
      setToken('')
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to connect')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="switcher">
      <div className="switch-row">
        <select value={activeId ?? ''} onChange={(e) => select(e.target.value || null)} aria-label="Workspace">
          <option value="">Demo workspace</option>
          {connections.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} ({new URL(c.url).host})
            </option>
          ))}
        </select>
        <button title="Connect an agent" onClick={() => setAdding(!adding)}>
          +
        </button>
        {activeId && (
          <button title="Remove this connection" onClick={() => confirm('Remove this connection?') && remove(activeId)}>
            ×
          </button>
        )}
      </div>
      {adding && (
        <form onSubmit={submit} className="connect-form">
          <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Agent URL" required />
          <input value={token} onChange={(e) => setToken(e.target.value)} placeholder="Token" type="password" required />
          <button disabled={busy}>{busy ? 'Connecting…' : 'Connect'}</button>
          {err && <p className="err">{err}</p>}
          <p className="hint">Run <code>smartmark-agent --root ~/notes</code> and open the link it prints, or paste the URL and token.</p>
        </form>
      )}
    </div>
  )
}
