# Smartmark — MVP Plan v0.2 (Local-only First Release)

Local-first, web-based Markdown note app (Typora-style) with AI side panel. This v0.2 plan removes any cloud sync for the first release, using only browser storage for notes and assets. Target users: individuals and general knowledge workers (PMs, marketers). Free tier only; users supply their own AI keys.

## 1) Goals and Non-Goals

- Goals (v0.2)
  - Typora-style WYSIWYG Markdown editor with raw Markdown toggle
  - Three-pane layout: Left (folders/notes), Center (editable preview), Right (AI chat/agent)
  - Offline-first using local browser storage (IndexedDB) for notes and images
  - Attachments v1: images (paste/drag/drop) stored locally
  - AI panel with project/folder context; agent edits current note only
  - Users configure their own AI keys (OpenAI, Anthropic, Gemini) stored locally
  - Basic import/export (zip of .md and assets) if time allows

- Non-Goals (v0.2)
  - GitHub or Google Drive sync (deferred)
  - Multi-user collaboration or accounts/sign-in
  - Knowledge graph/backlinks, advanced metadata, templates
  - Mobile/desktop native apps (web-only; PWA optional if time permits)

## 2) UX Spec

- Layout
  - Left: Project/Folder tree + note list with search/filter; New Note button
  - Center: Editable preview by default (Typora feel); toggle raw Markdown view
  - Right: AI panel with tabs: Chat | Agent (Agent limited to current note)

- Editor
  - Markdown: headings, lists, checkboxes, code blocks, tables, links, images
  - Focus mode (dim non-active block)
  - Inline formatting toolbar on selection; keyboard shortcuts for basics
  - Images: paste/drag to insert; stored locally and referenced via relative path

- AI Panel
  - Context: current project/folder; lightweight index of titles/headings/paragraphs
  - Chat: answer questions with citations (filenames/headers)
  - Agent: rewrite selection, summarize, fix grammar; show diff preview then apply

## 3) Data Model (Local Only)

- Note: id, title, slug, path, contentMarkdown, createdAt, updatedAt
- Asset (image): id, filename, mimeType, blobRef (IndexedDB), localPath
- Project: id, name, rootPath, settings (editor prefs, ai provider/model)

Storage: IndexedDB (Dexie) as the system of record; no remote.

## 4) Architecture

- Frontend-only (Next.js + React + TypeScript)
  - State: Zustand for app/UI state; Dexie for persistence
  - Editor: Milkdown (ProseMirror) — Markdown-first WYSIWYG with reliable MD import/export
  - Theming: App-level CSS variables + Milkdown theme API for Bear-like look (light/dark)
  - Search: MiniSearch (client-only) over local notes
  - AI: provider adapters (OpenAI/Anthropic/Gemini) using user keys from local storage
  - Optional: PWA for better offline and installable app shell

No backend required for v0.2.

### Theming & Bear-like UI

- Use CSS variables for color tokens, typography, spacing; provide light and dark themes
- Customize Milkdown theme: fonts, heading scale, code blocks (Prism/Shiki), selection/bubble menus
- Content width ~680–720px, generous line-height, comfortable paragraph spacing
- Focus mode: lower opacity on non-active blocks; highlight current line/section
- Offer a "Bear" theme at launch; consider a "Nord" variant; include a theme switcher

## 5) AI Integration

- Keys stored locally; never sent to a server
- Streaming responses in chat
- Context built from current project index (headings + paragraph chunks)
- Agent actions limited to current note; show diff before apply

## 6) Implementation Plan (Target: 6–8 hours)

- Hour 0–0.5: Project setup
  - Initialize Next.js (TS), Tailwind (or minimal CSS), dependencies: milkdown, dexie, zustand, minisearch
  - Create base 3-pane layout and theme (light/dark)

- Hour 0.5–2: Local data + navigation
  - Dexie schema for projects, notes, assets
  - Sidebar: project selector, folder tree, note list, new note
  - Basic search by title/content

- Hour 2–4: Editor
  - Typora-style editable preview using Milkdown; raw Markdown toggle via serializer
  - Focus mode via decorations; inline toolbar; keyboard shortcuts
  - Paste/drag-drop images -> store in assets; insert Markdown image link (blob URL)

- Hour 4–5.5: AI panel
  - Settings modal for AI provider + API key
  - Chat with context index; streaming UI
  - Agent actions on current note selection with diff preview

- Hour 5.5–7: Polish and persistence
  - Auto-save; optimistic updates; error toasts
  - Import/export (zip) if time allows; otherwise export single note
  - PWA basics if time allows

- Hour 7–8: QA and demo polish
  - Empty states, onboarding note, simple shortcuts list

## 7) Success Criteria

- Notes and images persist offline (close/open tab) via IndexedDB
- Editor feels Typora-like; raw toggle and focus mode work
- Theme switch (light/dark) applies to app chrome and Milkdown editor/preview
- AI chat references project notes with citations; agent edits current note via diff
- Basic search returns expected results

## 8) Risks & Mitigations

- Editor parity (MD <-> WYSIWYG): keep supported feature set tight; raw toggle fallback
- Image handling: constrain formats; sanitize filenames; verify persistence round-trips
- LLM latency/cost: user-provided keys; streaming UI; model selection
- Timeboxing: cut import/export and PWA if necessary to preserve core UX polish

## 9) Roadmap (Post v0.2)

- Add GitHub sync (single repo with project subfolders) or Google Drive
- Backlinks/tags/daily notes and templates
- Collaboration (CRDTs) and presence
- Desktop wrapper (Tauri/Electron) and mobile PWA polish
- Advanced AI: embeddings search, cross-note refactors, auto summaries
