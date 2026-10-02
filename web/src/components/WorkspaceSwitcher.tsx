import { useState } from 'react'
import { useWorkspaces } from '../workspace'
import { label } from '../connections'

type Kind = 'agent' | 'github'

export function WorkspaceSwitcher() {
  const { connections, activeId, select, connect, connectGitHub, remove } = useWorkspaces()
  const [adding, setAdding] = useState(false)
  const [kind, setKind] = useState<Kind>('github')
  const [url, setUrl] = useState('http://127.0.0.1:7777')
  const [repo, setRepo] = useState('')
  const [branch, setBranch] = useState('')
  const [token, setToken] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setErr('')
    try {
      if (kind === 'agent') await connect(url.trim(), token.trim())
      else await connectGitHub(repo, branch, token.trim())
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
              {label(c)}
            </option>
          ))}
        </select>
        <button title="Add a workspace" onClick={() => setAdding(!adding)}>
          +
        </button>
        {activeId && (
          <button title="Remove this workspace" onClick={() => confirm('Remove this workspace?') && remove(activeId)}>
            ×
          </button>
        )}
      </div>
      {adding && (
        <form onSubmit={submit} className="connect-form">
          <div className="seg kinds">
            {(['github', 'agent'] as Kind[]).map((k) => (
              <button type="button" key={k} className={k === kind ? 'on' : ''} onClick={() => setKind(k)}>
                {k === 'github' ? 'GitHub' : 'Agent'}
              </button>
            ))}
          </div>
          {kind === 'agent' ? (
            <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Agent URL" required />
          ) : (
            <>
              <input value={repo} onChange={(e) => setRepo(e.target.value)} placeholder="owner/repo" required />
              <input value={branch} onChange={(e) => setBranch(e.target.value)} placeholder="branch (default branch if empty)" />
            </>
          )}
          <input
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder={kind === 'agent' ? 'Agent token' : 'GitHub token'}
            type="password"
            autoComplete="off"
            required
          />
          <button disabled={busy}>{busy ? 'Connecting…' : 'Connect'}</button>
          {err && <p className="err">{err}</p>}
          {kind === 'agent' ? (
            <p className="hint">
              Run <code>smartmark-agent --root ~/notes</code> and open the link it prints, or paste the URL and token.
            </p>
          ) : (
            <p className="hint">
              Use a{' '}
              <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noreferrer">
                fine-grained token
              </a>{' '}
              limited to this repo with Contents: read and write. It is stored only in this browser.
            </p>
          )}
        </form>
      )}
    </div>
  )
}
