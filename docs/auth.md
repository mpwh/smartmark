# Auth and hosting model

One codebase, two ways to run it. The web app is a static client; the only things that touch your files are the GitHub API and `smartmark-agent`.

## Self-hosted (open source, no accounts)
- Serve the built `web/` anywhere (static files).
- Run `smartmark-agent` on the machine with the files. Auth is the agent's bearer token; `smartmark-agent` prints a connect link that carries it in the URL fragment.
- Local folder: works on localhost with no TLS. VPS: put TLS in front (`--tls-cert/--tls-key`, Caddy, or an SSH tunnel).
- GitHub: user pastes a fine-grained PAT (stored in the browser only).

## Hosted (sign in, nothing to set up)
Same web app and agent, plus a small hosted backend (also open source) that adds:
1. **Sign in with GitHub (OAuth).** GitHub workspaces work with zero setup. The backend only does the OAuth code-to-token exchange (needs the client secret); file traffic goes browser to GitHub directly.
2. **Synced workspace list and settings** per account, so a new browser just signs in.
3. **Relay for local and VPS agents.** `smartmark-agent link` does a device-code login (open a URL, approve), then keeps an outbound WebSocket to the relay. The browser reaches the agent through the relay. No open ports, no TLS setup, works behind NAT.

## Open decisions
- Relay privacy: the relay sees file contents in transit. Options: accept it (like most hosted tools), or end-to-end encrypt between browser and agent with a key exchanged at link time (relay then sees only ciphertext).
- Other sign-in providers beyond GitHub (Google, email magic link).
- Storing a GitHub token for the user server-side vs keeping it in the browser only (default: browser only).

## Build order
1. `smartmark-agent` direct mode (done).
2. GitHub adapter (PAT first, OAuth with the hosted backend after).
3. Hosted backend: OAuth, workspace sync, relay, `smartmark-agent link`.
