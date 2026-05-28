import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import { emitEvent, type FacadeEvent } from "./events";
import {
	getActiveRoomsForTeammate,
	getHarnessState,
	setHarnessState,
	saveMessage,
} from "./facade-db";

const OPENCODE_DB = "/Users/d.patnaik/.local/share/opencode/opencode.db";
const CLAUDE_PROJECTS_DIR = "/Users/d.patnaik/.claude/projects";
const CLAUDE_PROJECT_PREFIX = "-Users-d-patnaik-honeybloom-";

const CREDENTIAL_PATTERNS = [
	/auth\.json/,
	/\.env/,
	/\.pem/,
	/\.p12/,
	/tokens\//,
	/\.keys/,
	/[A-Za-z0-9+/]{40,}(?:={0,2})/,
];

function redactCredentials(text: string): string {
	let result = text;
	for (const pattern of CREDENTIAL_PATTERNS) {
		result = result.replace(pattern, "[credential redacted]");
	}
	return result;
}

function getTeammateName(directory: string): string {
	return directory.split("/").pop() || "";
}

function getActiveSessions(db: Database.Database): Map<string, string> {
	const rows = db
		.prepare(
			"SELECT s.id, s.directory FROM session s WHERE s.directory LIKE '%/honeybloom/%' ORDER BY s.time_created DESC"
		)
		.all() as { id: string; directory: string }[];
	const latest = new Map<string, string>();
	for (const row of rows) {
		if (!latest.has(row.directory)) {
			latest.set(row.directory, row.id);
		}
	}
	return latest;
}

const JUNK_PHRASES_FILE = "/Users/d.patnaik/honeybloom/library/facade/junk-phrases.md";
let junkPhrases: string[] = [];
try {
	junkPhrases = fs
		.readFileSync(JUNK_PHRASES_FILE, "utf-8")
		.split("\n")
		.map((l) =>
			l
				.trim()
				.toLowerCase()
				.replace(/[.!?…]+$/, "")
		)
		.filter((l) => l.length > 0);
} catch {}

function isJunkSentence(sentence: string): boolean {
	const trimmed = sentence
		.trim()
		.toLowerCase()
		.replace(/[.!?…]+$/, "");
	if (!trimmed) return true;
	return junkPhrases.includes(trimmed);
}

function applyJunkFilter(text: string): string {
	const sentences = text.split(/(?<=\.)\s+|\n+/).filter((s) => s.trim());
	const result = sentences.filter((s) => !isJunkSentence(s));
	return result.join("\n");
}

function emitTextResponse(
	part: Record<string, unknown>,
	teammate: string,
	createdAt: string
): void {
	const text = String(part.text || "");
	if (!text.trim()) return;
	const id = `harness-text-${teammate}-${createdAt}-${Math.random().toString(36).slice(2)}`;
	const cleaned = redactCredentials(text);
	const filtered = applyJunkFilter(cleaned);
	if (!filtered.trim()) return;
	const activeRooms = getActiveRoomsForTeammate(teammate);
	for (const room of activeRooms) {
		const roomId = `${id}-${room}`;
		saveMessage({
			id: roomId,
			conversationId: room,
			sender: teammate,
			content: filtered,
			createdAt,
			type: "response",
		});
		const event: FacadeEvent = {
			type: "message" as const,
			id: roomId,
			conversationId: room,
			sender: teammate,
			content: filtered,
			timestamp: createdAt,
			response: true,
		};
		emitEvent(event);
	}
}

const _g = globalThis as Record<string, unknown>;
let lastChecked: number =
	typeof _g.__opencodeLastChecked === "number"
		? _g.__opencodeLastChecked
		: Number(getHarnessState("opencode_last_checked") || "0");
let watcherCleanup: (() => void) | null = null;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;

// Claude Code JSONL reader state — offsets persisted in Facade DB
const jsonlOffsets = new Map<string, number>();
// Load persisted offsets from DB on module init
try {
	const stored = getHarnessState("jsonl_offsets");
	if (stored) {
		const parsed = JSON.parse(stored) as Record<string, number>;
		for (const [k, v] of Object.entries(parsed)) jsonlOffsets.set(k, v);
	}
} catch {}

function persistJsonlOffsets(): void {
	const obj: Record<string, number> = {};
	for (const [k, v] of jsonlOffsets) obj[k] = v;
	setHarnessState("jsonl_offsets", JSON.stringify(obj));
}
let claudeWatchers: fs.FSWatcher[] = [];
const claudeDebounceTimers = new Map<string, ReturnType<typeof setTimeout>>();

function getActiveJsonlFile(projectDir: string): string | null {
	try {
		const files = fs
			.readdirSync(projectDir)
			.filter((f) => f.endsWith(".jsonl"))
			.map((f) => ({
				name: f,
				mtime: fs.statSync(path.join(projectDir, f)).mtimeMs,
			}))
			.sort((a, b) => b.mtime - a.mtime);
		return files.length > 0 ? path.join(projectDir, files[0].name) : null;
	} catch {
		return null;
	}
}

function extractTeammateFromProjectDir(dirName: string): string {
	if (dirName.startsWith(CLAUDE_PROJECT_PREFIX)) {
		return dirName.slice(CLAUDE_PROJECT_PREFIX.length);
	}
	return "";
}

function checkClaudeJsonl(filePath: string, teammate: string): void {
	try {
		const stat = fs.statSync(filePath);
		const offset = jsonlOffsets.get(filePath) || 0;
		if (stat.size <= offset) return;

		// Atomically claim the new bytes BEFORE reading — prevents duplicate reads
		// when multiple watchers (or HMR reloads) fire simultaneously
		const claimedSize = stat.size;
		jsonlOffsets.set(filePath, claimedSize);
		persistJsonlOffsets();

		const fd = fs.openSync(filePath, "r");
		const buf = Buffer.alloc(claimedSize - offset);
		fs.readSync(fd, buf, 0, buf.length, offset);
		fs.closeSync(fd);

		const lines = buf
			.toString("utf-8")
			.split("\n")
			.filter((l) => l.trim());
		for (const line of lines) {
			try {
				const entry = JSON.parse(line);
				if (entry.type !== "assistant") continue;
				const message = entry.message;
				if (!message?.content) continue;
				const createdAt = entry.timestamp || new Date().toISOString();
				for (const part of message.content) {
					if (part.type === "text" && part.text?.trim()) {
						const trimmed = part.text.trimStart();
						if (trimmed.startsWith("Human:") || trimmed.startsWith("<system-reminder>")) continue;
						emitTextResponse({ text: part.text }, teammate, createdAt);
					}
					// Skip tool_use — facade-relay.sh already covers tool activity for Claude Code
				}
			} catch {
				// Skip malformed lines
			}
		}
	} catch (e) {
		console.error(`harness-reader: Claude JSONL read failed for ${teammate}`, e);
	}
}

function onClaudeJsonlChange(projectDir: string, teammate: string): void {
	const key = projectDir;
	const existing = claudeDebounceTimers.get(key);
	if (existing) clearTimeout(existing);
	claudeDebounceTimers.set(
		key,
		setTimeout(() => {
			const jsonlFile = getActiveJsonlFile(projectDir);
			if (jsonlFile) checkClaudeJsonl(jsonlFile, teammate);
			claudeDebounceTimers.delete(key);
		}, 100)
	);
}

function startClaudeCodeReader(): void {
	// Process-level guard — prevent duplicate watchers from HMR re-imports
	const g = globalThis as Record<string, unknown>;
	if (g.__claudeReaderActive) return;
	g.__claudeReaderActive = true;

	if (!fs.existsSync(CLAUDE_PROJECTS_DIR)) {
		console.error("harness-reader: Claude projects dir not found");
		g.__claudeReaderActive = false;
		return;
	}

	const dirs = fs
		.readdirSync(CLAUDE_PROJECTS_DIR)
		.filter((d) => d.startsWith(CLAUDE_PROJECT_PREFIX));
	console.log(`harness-reader: watching ${dirs.length} Claude Code project dirs`);

	for (const dirName of dirs) {
		const teammate = extractTeammateFromProjectDir(dirName);
		if (!teammate) continue;
		const projectDir = path.join(CLAUDE_PROJECTS_DIR, dirName);

		// Set initial offset to current file size ONLY if no DB-persisted offset exists
		const jsonlFile = getActiveJsonlFile(projectDir);
		if (jsonlFile && !jsonlOffsets.has(jsonlFile)) {
			try {
				const size = fs.statSync(jsonlFile).size;
				jsonlOffsets.set(jsonlFile, size);
				persistJsonlOffsets();
			} catch {}
		}

		try {
			const watcher = fs.watch(projectDir, (eventType, filename) => {
				if (filename?.endsWith(".jsonl")) {
					onClaudeJsonlChange(projectDir, teammate);
				}
			});
			claudeWatchers.push(watcher);
		} catch {}
	}
}

function stopClaudeCodeReader(): void {
	for (const w of claudeWatchers) {
		try {
			w.close();
		} catch {}
	}
	claudeWatchers = [];
	for (const t of claudeDebounceTimers.values()) clearTimeout(t);
	claudeDebounceTimers.clear();
	(globalThis as Record<string, unknown>).__claudeReaderActive = false;
}

function checkOpenCodeDb(): void {
	let db: Database.Database | null = null;
	try {
		db = new Database(OPENCODE_DB, { readonly: true });
		db.pragma("journal_mode = WAL");
		db.pragma("query_only = true");
		const sessions = getActiveSessions(db);
		if (sessions.size === 0) return;
		const sessionIds = Array.from(sessions.values());
		const placeholders = sessionIds.map(() => "?").join(",");
		const parts = db
			.prepare(
				`SELECT p.id, p.session_id, p.time_created, p.data, json_extract(m.data, '$.role') as role
				 FROM part p
				 JOIN message m ON m.id = p.message_id
				 WHERE p.session_id IN (${placeholders})
				 AND p.time_created > ?
				 ORDER BY p.time_created ASC`
			)
			.all(...sessionIds, lastChecked) as {
			id: string;
			session_id: string;
			time_created: number;
			data: string;
			role: string;
		}[];
		if (parts.length === 0) return;
		const teammateNames = new Map<string, string>();
		for (const [dir, sid] of sessions) {
			teammateNames.set(sid, getTeammateName(dir));
		}
		for (const part of parts) {
			const parsed = JSON.parse(part.data);
			const type = parsed.type;
			if (type !== "text") continue;
			if (part.role !== "assistant") continue;
			const teammate = teammateNames.get(part.session_id) || "unknown";
			const createdAt = new Date(part.time_created).toISOString();
			emitTextResponse(parsed, teammate, createdAt);
			if (part.time_created > lastChecked) {
				lastChecked = part.time_created;
			}
		}
		if (lastChecked > 0) {
			(globalThis as Record<string, unknown>).__opencodeLastChecked = lastChecked;
			setHarnessState("opencode_last_checked", String(lastChecked));
		}
	} catch (e) {
		console.error("harness-reader: OpenCode query failed", e);
	} finally {
		if (db) {
			try {
				db.close();
			} catch {}
		}
	}
}

function onDbChange(): void {
	if (debounceTimer) clearTimeout(debounceTimer);
	debounceTimer = setTimeout(() => {
		checkOpenCodeDb();
		debounceTimer = null;
	}, 50);
}

export function startHarnessReader(): void {
	// Process-level guard — prevent duplicate OpenCode readers from HMR re-imports
	const g = globalThis as Record<string, unknown>;
	if (g.__opencodeReaderActive) {
		// Still start Claude reader if needed (has its own guard)
		startClaudeCodeReader();
		return;
	}

	if (watcherCleanup) return;

	// OpenCode SQLite reader
	if (fs.existsSync(OPENCODE_DB)) {
		g.__opencodeReaderActive = true;
		checkOpenCodeDb();
		const dbDir = path.dirname(OPENCODE_DB);
		const watcher = fs.watch(dbDir, (eventType, filename) => {
			if (filename && filename.includes("opencode")) onDbChange();
		});
		watcherCleanup = () => {
			watcher.close();
			if (debounceTimer) clearTimeout(debounceTimer);
		};
		const interval = setInterval(() => {
			try {
				fs.statSync(OPENCODE_DB);
				onDbChange();
			} catch {
				clearInterval(interval);
			}
		}, 2000);
		const origCleanup = watcherCleanup;
		watcherCleanup = () => {
			origCleanup();
			clearInterval(interval);
		};
	} else {
		watcherCleanup = () => {};
	}

	// Claude Code JSONL reader
	startClaudeCodeReader();
}

export function stopHarnessReader(): void {
	if (watcherCleanup) {
		watcherCleanup();
		watcherCleanup = null;
	}
	(globalThis as Record<string, unknown>).__opencodeReaderActive = false;
	stopClaudeCodeReader();
}
