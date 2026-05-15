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
| `src/routes/+page.svelte` | Main chat UI: sidebar, message grid (72px+minmax(0,1fr), 570px), input bar, markdown rendering |

Design constants:
- Font: JetBrains Mono, weight 300, 12px, line-height 1.8
- Text color: `#CDCCC2`, muted: `#808080`
- Content width: 570px max, grid columns: 72px label + minmax(0, 1fr) content
- Background: `#0b0d10` (premium black), panels: `#0e1114`, elements: `#1e1e1e`, dividers: `#282a30`
- Sidebar: 280px, `#0e1114` bg, dashed `#282a30` border, three-section layout. Section headers in Inter. Teammate names in system-ui. Chat sender labels in Inter. (Teammates, Huddles, Past Rooms) with gradient headers and 60px padding-bottom per section. Huddle rooms read from `/tmp/kitty-huddles.json` (MCP huddle server state) with host name + participant list. Teammate and huddle names are lowercase.
- Input bar: 1px dashed `#282a30` border with 2px `#5A3E2E` (copper) left border, `#1e1e1e` bg. Boss messages also get 2px `#5A3E2E` left border.
- Markdown gradients: blue-to-purple (`#5c9cf5` → `#9d7cd8`) on headings/bold/blockquotes
- Keyboard shortcuts: Ctrl+Up/Down (sidebar nav), Enter (focus input), Escape (blur input)

### Server Layer (Kitty lifecycle mirror)

| File | Purpose |
|---|---|
| `src/lib/server/kitten.ts` | Discovers Kitty socket (`KITTY_LISTEN_ON` or `/tmp/honeybloom-kitty-*.sock`), parses `kitten @ ls` JSON, extracts teammate names from `window.user_vars.teammate` |
| `src/lib/server/active-teammates.ts` | JSON file state at `/tmp/facade-active-teammates.json`. Export: `activateTeammate()`, `deactivateTeammate()`, `getActiveTeammates()` |
| `src/lib/server/events.ts` | Wraps Node.js EventEmitter. Export: `emitEvent()`, `onEvent()`. Used for SSE push. |
| `src/lib/server/room-sync.ts` | Polls `getActiveTeammatesFromKitty()` every 3s. Compares with active state. Calls `emitEvent()` on changes. Bootstrapped in `hooks.server.ts:init()`. |

### Floating Input Bar (REQ-68)

The input bar uses `position: absolute; bottom: 0` inside the `position: relative` main content container. It floats over the chat area — when the textarea grows via autosize, it expands upward over chat messages without affecting the chat scroll container's height or scroll position. The chat scroll container has `padding-bottom: 130px` to clear the default single-line input bar height (~117px + breathing room). This value is coupled to the input bar layout — if the input bar's default height changes, the padding must be updated.

REQ-65 (ResizeObserver scroll compensation) was removed as dead code — the floating layout eliminates the need for JavaScript-based scroll adjustment.

### API Layer

| Route | Method | Purpose |
|---|---|---|
| `/api/rooms` | GET | Returns active teammates + huddles from JSON state |
| `/api/events` | GET | SSE stream — pushes events when room state changes |
| `/api/message` | POST | Accepts `{ sender, room, body }`. Stores message, forwards to target's Kitty tab via `kitten send-text`. Self-delivery guard: skips Kitty forward if sender is the room owner (no self-echo). |
| `/api/preferences` | GET, POST | Read/write `facade-preferences.json`. Stores `selectedRoom` (persisted sidebar selection across sessions). |

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

### Huddle Rooms

Active huddle rooms are managed by Facade-native huddle actions in `src/routes/api/huddle/+server.ts` (REQ-61). Huddle lifecycle (start, end, add, remove participants) is handled via the `mcp-huddle-server.js` MCP server, which calls the `/api/huddle` endpoint. Rooms are stored in SQLite with type `huddle` and session-scoped IDs (`huddle-{host}-{timestamp}`). The `/api/rooms` endpoint maps each entry to a huddle sidebar item with the host name and participant list. SSE-driven sidebar refresh picks up new huddles automatically when `loadSidebar()` is called on `huddle_update` events.

### Huddle Message Flow

Messages sent to `huddle-{host}` rooms fan out to all huddle members. The `/api/message` endpoint detects huddle rooms (room ID starts with `huddle-`), reads the SQLite participants list, and delivers via `sendToKitty` to every member except the sender. Token notifications are fanned out to all members' Kitty tabs only — not saved or displayed in Facade (REQ-64, REQ-77). Client-side filter also hides historical token messages from DB.

**Room resolution (REQ-69, REQ-78):** Huddle rooms are session-scoped (`huddle-{host}-{timestamp}`). Short-form IDs like `huddle-claire` resolve to the active room via `resolveActiveRoom()` using `originalRoomId`. Resolution runs BEFORE `roomExists()` check (REQ-78) — prevents past/ghost rooms from intercepting short-form IDs. All huddle room saveRoom calls set `originalRoomId: "huddle-{host}"`. Unresolvable huddle rooms return 404 — never create phantom direct rooms.

**Auto-request token (REQ-70):** Token enforcement is replaced with first-class auto-request. If the token is free, auto-grant and speak. If someone else holds it, auto-queue the sender and hold the message in `pending_messages` table. When the token advances to the queued sender, held messages are delivered automatically via `deliverPending()`. Boss-speaks and end-huddle deliver all pending messages via `deliverAllPending()` before clearing/closing. No 403 errors.

### Token Management (REQ-66/67)

Shared logic in `src/lib/server/token-helpers.ts`:
- **Boss clears (REQ-66):** When Boss posts in a huddle, token holder and queue are cleared. All members notified "Boss spoke – token released. Request to speak." Everyone re-requests fresh.
- **30s timeout (REQ-67):** `startTokenTimer(roomId)` sets a 30s setTimeout. If the holder doesn't post, the timer calls `getTokenHolder` (fire-time lookup, no stale refs) and advances to the next in queue. Timer restarts recursively if a new holder exists. Held messages for the new holder are delivered on advance.
- **Timer lifecycle:** Started on grant and token advance. Cleared on post, Boss clear, manual release, participant removal, and huddle end. No orphan timers (Pattern 1).

### Live Mirror (REQ-53/54/55/80/81/82)

Real-time tool activity relay for huddle observability. Three-part pipeline:

1. **PostToolUse hook** (`chica/hooks/facade-relay.sh`): Registered in `~/.claude/settings.json` for all Claude Code teammates. Checks flag file `/tmp/facade-relay-active-{teammate}` — exits immediately if absent (zero cost). Filters out `post_to_facade` tool calls (REQ-80). POSTs to `/api/tool-activity`.
2. **API endpoint** (`src/routes/api/tool-activity/+server.ts`): Saves as `type: "tool_call"` in SQLite, emits SSE with `toolCall: true`. Fans out full detail to all huddle participants' Kitty tabs via `sendToKitty` (REQ-81). Format: `[live-mirror] {sender} used {toolName}` + input + output + status.
3. **UI rendering** (`renderToolCard` in `+page.svelte`): Renders tool activity as compact cards with status badge, tool name, input/output blocks. Word wrap via `white-space: pre-wrap` (REQ-80). Sender label baseline aligned with card title via conditional padding (REQ-82).

Activation: Boss types `/start-livemirror {teammate}` in Facade input bar. Deactivation: `/end-livemirror`.

### REQ Log

| REQ | Description | Status |
|-----|-------------|--------|
| REQ-000 | UI integration — Chica's mockup into Facade | Shipped |
| REQ-002 | Fixed input bar position (outside scrollable area) | Shipped |
| REQ-003 | Wipe sample data — empty state | Shipped |
| REQ-004 | Kitty lifecycle mirror — teammate opens/closes in sidebar | Shipped |
| REQ-005 | SSE push replacing browser polling for instant updates | Shipped |
| REQ-006 | Facade auto-start/stop with Kitty lifecycle + port 51730 + notify_facade cleanup | DROPPED | Boss prefers manual Raycast shortcuts (Facade/Markwhen). Dead code cleaned from kitty-open-teammate.sh, watchdog deleted. |
| REQ-007 | Boss→Kitty messaging — POST /api/message, kitten send-text, SSE echo, conversation view | Shipped |
| REQ-012 | Input bar text wrapping — autosize library, auto-grow textarea, word-wrap instead of horizontal overflow | Shipped |
| REQ-013 | Sender guard removal — teammate-to-teammate Kitty delivery, unconditional forward | Shipped |
| REQ-015 | Input bar label "Boss" → "boss" | Shipped |
| REQ-016 | Sidebar architecture: 3-section layout (Teammates, Huddles, Past Rooms), natural flow, 60px section padding, scrollable | Shipped |
| REQ-017 | Huddle rooms in sidebar — reads `/tmp/kitty-huddles.json`, shows host name + participants in compact layout; teammate names lowercase | Shipped |
| REQ-018 | Premium black palette — `--color-bg: #0b0d10`, `--color-bg-panel: #0e1114`, `--color-bg-step4: #282a30`, sidebar border-right dashed | Shipped |
| REQ-019 | Dashed borders — all section dividers, provoque.ai footer, and input box use 1px dashed var(--color-bg-step4) | Shipped |
| REQ-020 | Sidebar section headers font changed to Inter | Shipped |
| REQ-021 | Sidebar teammate name fonts changed to system-ui | Shipped |
| REQ-022 | Chat sender labels font changed to Inter | Shipped |
| REQ-023 | Remove Send button, spacer preserves input bar height | Shipped |
| REQ-024 | 2px #5A3E2E copper left border on input box and boss messages | Shipped |
| REQ-025 | "Fire up Markwhen" button in sidebar, symlinks markwhen-fork.html + dist/ into static/, replaces provoque.ai footer | Shipped |
| REQ-026 | Fan-out delivery from huddle rooms — messages to huddle-{host} deliver to all members' Kitty tabs | Shipped |
| REQ-056 | Huddle state polling in room-sync.ts — `/tmp/kitty-huddles.json` polled every 3s, `huddle_update` SSE emitted on state change | Shipped |
| REQ-057 | Delete old communication tools — removed send_message (honeybloom-mailbox MCP) and post_in_huddle (honeybloom-huddle) from all teammate configs and server-huddle.py. Facade post_to_facade is the replacement. | Shipped |
| REQ-058 | Sender identity fix — removed FACADE_SENDER=rio from user-level ~/.claude.json. CWD-based derivation (`basename(process.cwd())`) now takes effect for all 30 Claude Code teammates. Type C — takes effect on session restart. | Shipped |
| REQ-060 | Session-scoped room IDs — per-session isolation for direct rooms. Room created on teammate activation with `direct-{name}-{timestamp}` ID. Past rooms display full ID with prefix. | Shipped |
| REQ-061 | Facade-native huddle lifecycle tools — start_huddle, end_huddle, add_to_huddle, remove_from_huddle, request_token, release_token. SQLite huddle_tokens table, auto-wake, sendToKitty notifications. | Shipped |
| REQ-062 | Server-side token enforcement — `/api/message` rejects huddle posts from non-holders. Boss and system exempt. `getTokenHolder()` added to facade-db. Token cleanup on participant removal. | Shipped |
| REQ-063 | Fix token enforcement placement — check before `saveMessage`/`emitEvent` instead of after. Prevents rejected posts from appearing in Facade. | Shipped |
| REQ-064 | Token notification delivery — fan-out "Token passed to X" to all huddle members' Kitty tabs via `sendToKitty`. Fixes deadlock where new holder didn't know it was their turn. | Shipped |
| REQ-065 | Chat window jump fix via ResizeObserver — FAILED. Wrong approach (JS compensation for layout problem). Replaced by REQ-068. | Failed |
| REQ-066 | Boss message clears token — holder and queue cleared, "Boss spoke – token released" notification to all members. | Shipped |
| REQ-067 | Token timeout — 30s auto-release. Timer managed across all lifecycle paths. Shared token-helpers.ts module. | Shipped |
| REQ-068 | Floating input bar — position absolute over chat area. padding-bottom clearance. Replaces REQ-065. | Shipped |
| REQ-069 | Huddle room resolution — short-form IDs resolve to active session-scoped room via originalRoomId. Guard prevents phantom direct rooms. Ghost rooms cleaned. | Shipped |
| REQ-070 | Auto-request token — no 403. Token free → auto-grant. Someone else holds → auto-queue + hold message in pending_messages. Delivered on token advance, Boss-speaks, or huddle end. | Shipped |

## Conventions

- No em dashes. En dash with spaces for dashes: "the app — built for privacy".
- Follow existing patterns (Svelte 5 runes, Tailwind classes).
- No comments unless explaining a non-obvious decision.
- ARCHITECTURE.md is the source of truth. Update after every shipped REQ.
