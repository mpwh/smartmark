# smartmark-agent

Serves one folder to the Smartmark web app over a small authenticated HTTP API. Single static binary, no dependencies.

```
go build -o smartmark-agent ./agent          # or: go install github.com/mpwh/smartmark/agent@latest
smartmark-agent --root ~/notes --app http://localhost:5173
```

It prints a link like `http://localhost:5173/#connect=…&token=…`. Open it and the web app saves the connection. The token is in the URL fragment, so it is never sent to any server. Pass `--token` (or `SMARTMARK_TOKEN`) for a stable token across restarts.

## Flags
| flag | default | |
|---|---|---|
| `--root` | `.` | folder to serve |
| `--addr` | `127.0.0.1:7777` | listen address |
| `--token` | random per start | bearer token (min 16 chars) |
| `--app` | `http://localhost:5173` | web app URL; also an allowed CORS origin |
| `--origin` | | extra allowed origin (repeatable) |
| `--tls-cert/--tls-key` | | serve HTTPS (needed for a hosted https web app to reach a remote agent) |

## API (all require `Authorization: Bearer <token>`)
- `GET /v1/info`
- `GET /v1/files` lists files: `{"files": ["a.md", "notes/b.md"]}`
- `GET /v1/file?path=` returns the content with an `ETag`
- `PUT /v1/file?path=` writes atomically. Send `If-Match: <etag>` to detect changes made elsewhere (`412` on mismatch)
- `GET /v1/events?token=` is an SSE stream with `change` events carrying the changed paths

## Security model
- Listens on localhost by default. Binding elsewhere without TLS logs a warning.
- Paths are validated and resolved through symlinks; nothing outside `--root` is readable or writable.
- Dot-entries (`.git`, `.env`, …), `node_modules` and symlinks are never listed or served. Only `.smartmark/` is allowed.
- Writes are limited to `.md`/`.markdown` files and `.smartmark/`. Max body 8 MiB.
- CORS only allows the configured origins.
