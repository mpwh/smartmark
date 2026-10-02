# Auth and hosting model

One codebase, two ways to run it. The web app is a static client; the only things that touch your files are the GitHub API and `smartmark-agent`.

## Self-hosted (open source, no accounts)
- Serve the built `web/` anywhere (static files).
- Run `smartmark-agent` on the machine with the files. Auth is the agent's bearer token; `smartmark-agent` prints a connect link that carries it in the URL fragment.
- Local folder: works on localhost with no TLS. VPS: put TLS in front (`--tls-cert/--tls-key`, Caddy, or an SSH tunnel).
- GitHub: user pastes a fine-grained personal access token, limited to the one repo with **Contents: read and write**.
  It is stored in this browser only (`localStorage`), the same as the agent token, and sent only to `api.github.com`.
  Each save is one commit (`Update <path>`); there is no timed autosave for GitHub.

## Hosted (sign in, nothing to set up)
Same web app and agent, plus a small hosted backend (also open source) that adds:
1. **Sign in with GitHub (OAuth).** GitHub workspaces work with zero setup. The backend only does the OAuth code-to-token exchange (needs the client secret); file traffic goes browser to GitHub directly.
2. **Synced workspace list and settings** per account, so a new browser just signs in.
3. **Relay for local and VPS agents.** `smartmark-agent link` does a device-code login (open a URL, approve), then keeps an outbound WebSocket to the relay. The browser reaches the agent through the relay. No open ports, no TLS setup, works behind NAT.

## End-to-end encrypted relay (decided, not built)
- The relay is a dumb pipe: it forwards opaque frames between browser and agent, keyed by agent id. It holds no keys.
- The agent has a long-term keypair. Pairing (`smartmark-agent link`) pins its public key in the browser; the user confirms a short fingerprint once.
- Sessions use an established handshake (Noise IK/XX or equivalent), not a custom protocol. The library is chosen when this is built.
- The relay still sees: agent id, timing and message sizes.
- Not covered by E2E:
  - The hosted web app itself. It serves the JavaScript, so a malicious or compromised origin could read plaintext. Self-hosting the web app removes this.
  - A backend that hands a new device a substituted agent key. Fingerprint confirmation and key pinning mitigate this.

## Open decisions
- Other sign-in providers beyond GitHub (Google, email magic link).
- Storing a GitHub token for the user server-side vs keeping it in the browser only (default: browser only).

## Build order
1. `smartmark-agent` direct mode (done).
2. GitHub workspaces with a token (done). OAuth sign-in comes with the hosted backend.
3. Hosted backend: OAuth, workspace sync, E2E relay, `smartmark-agent link`.
