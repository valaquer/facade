# Facade — Architecture

## Origin

Forked from HuggingFace Chat UI (upstream: github.com/huggingface/chat-ui).
The upstream codebase contains many features irrelevant to Facade. Rather than
strip them, we leave them in place and document them here. Dead code that does
not execute does not cause bugs.

## How to use this document

Each feature below is classified as either **Keep** or **Drop**.

- **Keep:** We use or may use this. Read and understand it before modifying.
- **Drop:** Dead code from the upstream. Do not touch. If a build error traces
  to it, replace with a stub — do not fix or extend.

## Feature Registry

### 1. Authentication (DROP)

HuggingFace OAuth login/logout. Routes at `/login`, `/login/callback`,
`/logout`, `.well-known/oauth-cimd`. Server modules: `auth.ts`,
`adminToken.ts`, `apiToken.ts`. Types: `User.ts`, `Session.ts`.
Utility: `utils/auth.ts` (`requireAuthUser`).

Gated behind CLIENT_ID env var — does not run on localhost unless configured.
Safe to leave in place.

### 2. Model support (DROP)

Model list, model switching in chat, model detail pages with thumbnails,
model subscriptions. Routes at `/models`, `/models/{name}`. API at
`/api/models`, `/api/v2/models/*`. Server modules: `models.ts`,
`endpoints/` (OpenAI, image generation). Not needed — Facade is
a comms layer, not an AI chat app.

### 3. Conversation management (KEEP)

Core chat infra: create, load, rename, delete conversations; message history.
Routes at `/conversation/[id]`. API at `/api/conversation/*`,
`/api/v2/conversations/*`. Server module: `conversation.ts`.

Sub-features that could be split:
- **3A (KEEP):** Basic CRUD, message loading
- **3B (DROP):** Message tree with branching / alternate replies
- **3C (DROP):** Public share links (`/r/[id]`)

### 4. User settings (DROP)

Settings page at `/settings` with per-model config (custom prompts, provider
override, multimodal/tools toggle), theme switching (dark/light), haptics.
Store: `stores/settings.ts`. API: `/api/v2/user/settings`.
Not needed — no models to configure in Facade.

### 5. File attachments (KEEP)

Upload images, text files, PDFs into conversations. Paste from clipboard.
Fetch from URL. File preview/download. Components: `FileDropzone.svelte`,
`UploadedFile.svelte`, `UrlFetchModal.svelte`, `ImageLightbox.svelte`.
Server: `files/uploadFile.ts`, `files/downloadFile.ts`.
Needed for screenshot sharing.

### 6. Voice input (DROP)

Microphone recording, transcription API, audio waveform. Components:
`VoiceRecorder.svelte`, `AudioWaveform.svelte`. API: `/api/transcribe`.
AI-chat feature, not needed for teammate comms.

### 7. MCP (Model Context Protocol) (DROP)

MCP client with server management UI (add/remove/toggle servers), tool
calling in conversations. Components: `MCPServerManager.svelte`,
`AddServerForm.svelte`, `ServerCard.svelte`. API: `/api/mcp/*`.
Store: `stores/mcpServers.ts`. Server: `mcp/`. Not needed — Facade
does not route to LLMs.

### 8. Text generation (DROP)

LLM streaming pipeline, stop/retry, reasoning blocks, arch-router for model
fallback, text generation engine with file refs and MCP tool orchestration.
Server modules: `textGeneration/`, `router/`, `generateFromDefaultEndpoint.ts`.
Not needed — Facade is human-to-human communication.

### 9. Admin panel (DROP)

Conversation data export (`/admin/export`), usage stats (`/admin/stats/compute`).
Protected by admin API secret. Not needed for localhost tool.

### 10. Metrics & logging (PARTIAL)

Prometheus metrics endpoint at `/metrics` — **DROP** (production monitoring).
Pino structured logging (`logger.ts`) — **KEEP** (useful for debugging message
routing failures, DB errors, SSE drops).

### 11. Sharing (DROP)

Public conversation share links (`/r/[id]`), HuggingFace Hub integration.
Component: `ShareConversationModal.svelte`. Not needed — Facade is
private teammate chat.

### 12. Mobile support (KEEP)

Responsive layout, mobile nav sidebar, virtual keyboard handling.
Component: `MobileNav.svelte`. Low weight, zero maintenance cost.

### 13. Background generation (DROP)

Polls for in-progress AI generations. Component:
`BackgroundGenerationPoller.svelte`. Store: `backgroundGenerations.ts`.
AI-chat feature — not relevant for Facade.

### 14. Health check (KEEP)

`/healthcheck` endpoint returning OK. One file, zero complexity.
Useful to verify server is alive during development.

### 15. Privacy page (DROP)

Static privacy policy at `/privacy`. HF-specific, irrelevant for localhost tool.

### 16. Debug endpoints (DROP)

OpenAI debug (`__debug/openai`), config dump (`/api/v2/debug/config`),
refresh (`/api/v2/debug/refresh`). Dev aids — not needed.

### 17. Docker/Deployment (DROP)

Dockerfile, docker-compose.yml, Helm chart, entrypoint.sh. Not needed —
Facade runs locally via `npm run dev`.

### 18. Static assets (DROP branding, KEEP icons)

HF branding (favicons, manifest, OG thumbnails) — **DROP.** Reusable icon
SVGs (burger, chevron, loading, sun/moon, etc. in `components/icons/`) —
**KEEP.** Small, no deps, useful for Facade UI.

### 19. Markdown rendering (KEEP)

Renders message content as formatted text — bold, italic, code blocks with
syntax highlighting, LaTeX math, links, tables. Components:
`MarkdownRenderer.svelte`, `CodeBlock.svelte`, `MarkdownBlock.svelte`.
Utilities: `marked.ts`, `parseBlocks.ts`, `parseIncompleteMarkdown.ts`.
Essential for readable teammate communication (code snippets, formatted messages).


## Built Architecture (Facade-specific)

Everything in this section is custom code added on top of the upstream HF fork.
These files are ours — modify freely.

### Stack

- SvelteKit 2 + Svelte 5 (runes: $state, $effect, $props, $derived)
- TailwindCSS v3 for styling
- JetBrains Mono (Google Fonts CDN) — 300 weight, 12px, 1.8 line-height
- `marked` library for markdown rendering (GFM enabled)
- No database yet — state lives in `/tmp/facade-active-teammates.json`
- No auth required — localhost only

### UI Layer (Chica's spec, pixel-perfect)

| File | Purpose |
|---|---|
| `src/app.css` | All theme variables, markdown styles (Obsidianite gradients), diff rendering, code blocks |
| `src/routes/+layout.svelte` | Root layout — imports app.css, JetBrains Mono font, renders children |
| `src/routes/+page.svelte` | Main chat UI: sidebar, message grid (72px+1fr, 570px), input bar, markdown rendering |

Design constants:
- Font: JetBrains Mono, weight 300, 12px, line-height 1.8
- Text color: `#CDCCC2`, muted: `#808080`
- Content width: 570px max, grid columns: 72px label + 1fr content
- Background: `#0a0a0a`, panels: `#141414`, elements: `#1e1e1e`
- Sidebar: 280px, `#141414` bg, `#282828` border, three-section layout (Teammates, Huddles, Past Rooms) with gradient headers and 60px padding-bottom per section
- Input bar: 2px `#484848` left border, `#1e1e1e` bg
- Markdown gradients: blue-to-purple (`#5c9cf5` → `#9d7cd8`) on headings/bold/blockquotes
- Keyboard shortcuts: Ctrl+Up/Down (sidebar nav), Enter (focus input), Escape (blur input)

### Server Layer (Kitty lifecycle mirror)

| File | Purpose |
|---|---|
| `src/lib/server/kitten.ts` | Discovers Kitty socket (`KITTY_LISTEN_ON` or `/tmp/honeybloom-kitty-*.sock`), parses `kitten @ ls` JSON, extracts teammate names from `window.user_vars.teammate` |
| `src/lib/server/active-teammates.ts` | JSON file state at `/tmp/facade-active-teammates.json`. Export: `activateTeammate()`, `deactivateTeammate()`, `getActiveTeammates()` |
| `src/lib/server/events.ts` | Wraps Node.js EventEmitter. Export: `emitEvent()`, `onEvent()`. Used for SSE push. |
| `src/lib/server/room-sync.ts` | Polls `getActiveTeammatesFromKitty()` every 3s. Compares with active state. Calls `emitEvent()` on changes. Bootstrapped in `hooks.server.ts:init()`. |

### API Layer

| Route | Method | Purpose |
|---|---|---|
| `/api/rooms` | GET | Returns active teammates + huddles from JSON state |
| `/api/events` | GET | SSE stream — pushes events when room state changes |
| `/api/message` | POST | Accepts `{ sender, room, body }`. Stores message, forwards to target's Kitty tab via `kitten send-text`. Self-delivery guard: skips Kitty forward if sender is the room owner (no self-echo). |

### Message Flow (REQ-013)

```
Teammate A → post_to_facade(body="hello", room="direct-b")
  → MCP server → POST /api/message { sender: "a", room: "direct-b", body: "hello" }
  → Server stores message, emits SSE event for Facade UI
  → Target check: room owner "b" !== sender "a" → deliver to Kitty
  → sendToKitty("b", "[a] hello")
  → Teammate B's Kitty tab receives the message as typed input
```

Same flow applies for Boss → teammate (sender="boss" is no longer hardcoded — the self-delivery guard handles all senders uniformly).

### Data Flow

```
Kitty tab opens (kitten send-text --match "var:teammate=X")
  → room-sync.ts polls kitten @ ls every 3s
  → Detects new teammate, calls activateTeammate()
  → emitEvent({ type: "huddle_update" })
  → /api/events SSE stream pushes to browser
  → +page.svelte EventSource receives event, calls loadSidebar()
  → Sidebar re-renders with new teammate entry
```

Same flow in reverse for tab close (deactivateTeammate → SSE → sidebar update).

### REQ Log

| REQ | Description | Status |
|-----|-------------|--------|
| REQ-000 | UI integration — Chica's mockup into Facade | Shipped |
| REQ-002 | Fixed input bar position (outside scrollable area) | Shipped |
| REQ-003 | Wipe sample data — empty state | Shipped |
| REQ-004 | Kitty lifecycle mirror — teammate opens/closes in sidebar | Shipped |
| REQ-005 | SSE push replacing browser polling for instant updates | Shipped |
| REQ-006 | Facade auto-start/stop with Kitty lifecycle + port 51730 + notify_facade cleanup | Pending lifecycle test |
| REQ-007 | Boss→Kitty messaging — POST /api/message, kitten send-text, SSE echo, conversation view | Shipped |
| REQ-012 | Input bar text wrapping — autosize library, auto-grow textarea, word-wrap instead of horizontal overflow | Shipped |
| REQ-013 | Sender guard removal — teammate-to-teammate Kitty delivery, unconditional forward | Shipped |
| REQ-015 | Input bar label "Boss" → "boss" | Shipped |
| REQ-016 | Sidebar architecture: 3-section layout (Teammates, Huddles, Past Rooms), natural flow, 60px section padding, scrollable | Shipped |

## Conventions

- No em dashes. En dash with spaces for dashes: "the app — built for privacy".
- Follow existing patterns (Svelte 5 runes, Tailwind classes).
- No comments unless explaining a non-obvious decision.
- ARCHITECTURE.md is the source of truth. Update after every shipped REQ.
