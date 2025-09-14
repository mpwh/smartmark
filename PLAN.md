# Smartmark — MVP Plan (8-hour Hackathon)

A local-first, web-based Markdown note app (Typora-style) with GitHub sync and an AI side panel. Target users: individuals and knowledge workers (PMs, marketers). Free tier only for MVP: GitHub sync and users bring their own AI key.

## 1) Goals and Non-Goals

- Goals (MVP)
  - Typora-style WYSIWYG Markdown editor with a raw Markdown toggle
  - Left nav: folders and note list; Main: editable preview; Right: AI chat/agent
  - Offline first with local cache; fast startup, graceful offline behavior
  - GitHub sync (user-authenticated) as optional source of truth
  - Attachments v1: images only (paste/drag/drop into notes)
  - AI panel that can:
    - Chat with project/folder context (search/index local notes)
    - Agent action limited to editing the current note
  - Users provide their own AI keys (OpenAI, Anthropic, Gemini)
  - Simple import/export of a folder of .md files and images

- Non-Goals (MVP)
  - Real-time multi-user collaboration
  - Knowledge graph/backlinks, complex metadata, or templates system
  - Google Drive sync (focus on GitHub to ship in 8 hours)
  - Multi-platform native apps (web-only; PWA optional if time allows)

## 2) Viability Snapshot

- Market: Competitive but still room for a fast, web-first, offline-capable, Typora-like editor with simple GitHub sync and an integrated AI panel.
- Differentiation day-one vs Bear/Notion/Obsidian:
  - Web-first Typora feel, zero setup; bring-your-own-LLM with context of your notes
  - Simple GitHub sync without vendor lock-in; local-first responsiveness
- Risks & Mitigations
  - OAuth setup time: pre-create GitHub OAuth app and keep scopes minimal; fallback PAT input if needed
  - Editor quirks: choose a battle-tested WYSIWYG Markdown foundation (Tiptap+MD or Milkdown)
  - LLM cost/latency: BYO keys; stream tokens; allow model choice

## 3) UX Spec

- Layout
  - Left: Project/Folder tree + note list (filter/search; new note button)
  - Center: Typora-style editable preview by default; toggle to raw Markdown
  - Right: AI panel with tabs: Chat | Agent (Agent edits current note only)

- Editor
  - Markdown features: headings, lists, checkboxes, code blocks, tables, links, images
  - Focus mode (dim non-active paragraphs/blocks)
  - Inline toolbar on selection; slash menu optional if time allows
  - Paste/drag image -> stored locally; on sync -> committed to repo

- AI Panel
  - Context scope: current folder/project (file list + headings/paragraph chunks)
  - Chat mode: ask questions; citations (filenames/headers) when referencing notes
  - Agent mode: Rewrite paragraph, Summarize note, Fix grammar -> proposes diff; user applies

- Navigation
  - Folders, notes list; quick search by title/content; basic tags optional later

## 4) Data Model

- Note
  - id, title, slug, path, contentMarkdown, updatedAt, createdAt
- Asset (image)
  - id, filename, mimeType, blobRef (IndexedDB), path (for GitHub commit)
- Project
  - id, name, rootPath, settings (syncProvider, repo info), embeddingsStatus
- SyncState
  - lastSyncedAt, lastLocalChangeAt, remoteHeadSha (GitHub), conflict flags

Local-first store: IndexedDB (Dexie). Files mirrored in a virtual FS structure for rendering and sync.

## 5) Architecture

- Frontend-only MVP (Next.js/React + TypeScript)
  - State: Zustand for UI/app state; Dexie for content persistence
  - Editor: Tiptap (ProseMirror) with Markdown extension OR Milkdown
  - AI: thin adapter layer for OpenAI, Anthropic, Gemini via keys stored locally
  - Sync: Browser -> GitHub REST API (octokit). Commit .md and image files
  - Search/Context: Client-side inverted index (MiniSearch) + embeddings (optional time permitting)

- Optional minimal backend (only if needed)
  - For OAuth callback token exchange if PKCE implicit flow is insufficient/time-consuming
  - If skipped, accept GitHub PAT input from user for MVP

## 6) GitHub Sync Design (Free Tier)

- Auth
  - Preferred: OAuth app with repo scope limited to a single repo the user selects/creates
  - Fallback: User pastes a GitHub PAT with repo scope

- Repo model
  - One repo per user for all notes, directory per project: smartmark/<project-name>
  - Structure:
    - projects/<project>/notes/*.md
    - projects/<project>/assets/img/*
    - .smartmark/meta.json (optional for future)

- Operations
  - Pull: list files; fetch changed blobs by comparing tree SHAs; update local IndexedDB
  - Push: calculate file diffs; create commit with updated blobs and tree; fast-forward main
  - Conflicts: last-write-wins with timestamp + warn user; keep conflicted copy note (conflict yyyy-mm-dd).md

## 7) AI Integration

- Providers: OpenAI, Anthropic, Gemini via user-provided API keys stored in local storage (never sent to server)
- Context building
  - Build a lightweight index of current project (titles + headings + paragraph chunks)
  - Optionally compute embeddings (if provider allows) and cache locally
- Chat mode
  - System prompt guides assistant to quote snippets and include filenames/headers
  - Streaming responses; copy-to-clipboard; insert into note
- Agent mode (current note only)
  - Actions: Rewrite selection, Summarize, Expand/Shorten, Fix grammar/style
  - Show diff preview (side-by-side); user approves changes

## 8) Security & Privacy

- All content stored locally in IndexedDB; sync only to user’s GitHub when enabled
- API keys stored in local storage; used only client-side
- No server data retention for MVP

## 9) Implementation Plan (8 hours)

- Hour 0–0.5: Project setup
  - Create Next.js (TS) app; install deps: tiptap (or milkdown), dexie, zustand, octokit, minisearch
  - Set up basic routing/layout with 3-pane responsive layout

- Hour 0.5–2: Local data layer and nav
  - Dexie schema: projects, notes, assets
  - Create sidebar with project selection, folder tree, note list, new note
  - Basic search by title/content

- Hour 2–4: Editor
  - Integrate Typora-style editable preview with Markdown toggle
  - Focus mode toggle
  - Paste/drag-drop image -> store in assets; insert MD image link

- Hour 4–5.5: AI panel
  - Provider settings screen for API keys
  - Chat mode (streaming), context index of current project
  - Agent actions for current note selection with diff preview

- Hour 5.5–7: GitHub sync (PAT path if OAuth not ready)
  - Connect repo (create/select)
  - Pull and push .md and assets; basic conflict handling

- Hour 7–8: Polish & QA
  - Empty states, error toasts, optimistic updates
  - PWA install (optional), keyboard shortcuts, simple theming (light/dark)

## 10) Dependencies

- React 18, Next.js 14 (App Router)
- TypeScript, Zustand, Dexie, Octokit, MiniSearch
- Editor: Tiptap + Markdown extension (or Milkdown if faster for Typora feel)
- UI: Tailwind CSS (speed) or minimal CSS Modules if preferred

## 11) Success Criteria (MVP)

- Create notes offline, restart browser, notes persist
- Paste images; they render and persist
- Toggle Markdown/raw view; focus mode works
- GitHub PAT configured -> push/pull works; notes appear in repo
- AI chat returns responses referencing project notes; agent edits current note with diff preview

## 12) Future Roadmap (Post-MVP)

- Google Drive sync
- Collaboration with CRDTs (Yjs) and presence
- Backlinks, tags, daily notes, templates, slash commands
- Mobile PWA polish, desktop wrapper (Electron/Tauri)
- Advanced AI tools: cross-note refactors, automated summaries, semantic search with embeddings

## 13) Open Decisions to Confirm

- Repo model: single repo with subfolders vs per-project repos (default above: single repo)
- Exact Markdown feature set priority (tables, callouts, math)
- Image handling on GitHub: keep under assets/img/ with hashed filenames
- OAuth vs PAT for hackathon demo (leaning PAT for speed)
- Editor foundation: Tiptap vs Milkdown preference

## 14) Risks and Mitigations (MVP)

- OAuth approval delays -> PAT path for demo
- Editor edge cases (MD <-> WYSIWYG parity) -> constrain feature set; add raw toggle
- Rate limits (GitHub/LLMs) -> cache aggressively; user-selectable model; retry/backoff
- Timeboxing -> cut scope to essentials; ship a smooth single-project demo if needed
