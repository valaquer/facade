# RUNBOOK -- Project Facade

Layer 1 (universal module) and Layer 2 (failure pattern library) are symlinked from canonical. This file is Layer 3 (project-specific) plus the project tables.

---

## Layer 3 -- Project Facade

### Project Identity

| Field | Value |
|-------|-------|
| Name | Facade |
| Principal | Natalie |
| QA | Rio |
| Layer Lead | Rio |
| Codebase | `/Users/d.patnaik/honeybloom/natalie/Facade/` |
| Architecture | `ARCHITECTURE.md` in project root |
| Deployment | localhost |
| Port | 5173 |
| Dev server | `npm run dev` |
| Jira | TBD (Zara to cut epic) |

### What Facade Is

A thin localhost-based chat interface that lets Boss and teammates interact at MCP speed. Sits above Kitty. Eliminates the file-write bottleneck in the current mailbox/huddle flow.

- **Facade handles:** Huddle threads, email conversations, teammate communication
- **Kitty handles:** Claude Code / OpenCode harness execution, diffs, tool calls, thinking

Facade is not a harness. It takes on none of Kitty's work.

### Tech Stack

Upstream HuggingFace Chat UI (unstripped). SvelteKit + SQLite (better-sqlite3). Inert HF features (OAuth, model switching, MCP, voice, admin) are left alone -- don't touch, don't fix, don't strip. Build on top.

### Scope Boundary

Facade renders text messages between teammates and Boss. It does NOT render:
- Diffs or file edits
- Tool call indicators
- Extended thinking blocks
- Any harness output

If Boss needs to see code work, he goes to Kitty.

### Environment Setup

```
cd /Users/d.patnaik/honeybloom/natalie/Facade
npm install
npm run dev
```

Opens at http://localhost:5173.

### Constraints

1. **One REQ at a time.** Boss gives a REQ. Full Module B cycle. Boss tests. Next REQ.
2. **No stripping.** Inert upstream code stays. Only modify what the REQ touches.
3. **ARCHITECTURE.md is the source of truth.** Update it after every shipped REQ.
4. **Additive posture.** Existing mailbox/huddle infrastructure stays untouched until Facade is proven and Boss decides to migrate.

---

## REQ LOG

| REQ # | Date | Description | Status | Notes |
|-------|------|-------------|--------|-------|
| | | | | |

## KNOWN ISSUES

| Issue | Date Found | Severity | Workaround |
|-------|-----------|----------|------------|
| | | | |

## FAILED ATTEMPTS

| REQ # | Attempt | What Was Tried | Why It Failed | Root Cause |
|-------|---------|---------------|---------------|------------|
| | | | | |

---

End of Layer 3. Layer 1 and Layer 2 are symlinked canonical skills deployed by Claire.
