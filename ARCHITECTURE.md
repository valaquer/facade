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


## Architecture

### Stack

- SvelteKit 2 + Svelte 5 (runes: $state, $effect, $props)
- MongoDB for persistence (auto-fallback to MongoMemoryServer)
- TailwindCSS for styling

### Key Directories

```
src/
├── lib/
│   ├── components/       # Svelte components
│   ├── server/           # Server-side modules
│   │   ├── auth.ts       # DROP — authentication
│   │   ├── database.ts   # MongoDB collections
│   │   ├── models.ts     # Model registry
│   │   └── ...
│   ├── stores/           # Svelte stores
│   ├── types/            # TypeScript interfaces
│   └── utils/            # Helpers
├── routes/               # SvelteKit routes
└── styles/               # CSS
```

## Conventions

- No em dashes. En dash with spaces for dashes: "the app — built for privacy".
- Follow existing patterns (Svelte 5 runes, Tailwind classes).
- No comments unless explaining a non-obvious decision.
