import Database from "better-sqlite3";
import fs from "fs";
import { emitEvent, type FacadeEvent } from "./events";
import { getActiveRoomsForTeammate, getHuddleMembers } from "./facade-db";
import { sendToKitty } from "./kitten";

const OPENCODE_DB = "/Users/d.patnaik/.local/share/opencode/opencode.db";

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

function emitToolCall(
	part: Record<string, unknown>,
	sessionId: string,
	teammate: string,
	createdAt: string
): void {
	const toolInput = part.state?.input ? JSON.stringify(part.state.input) : "";
	const toolOutput = part.state?.output ? redactCredentials(String(part.state.output)) : "";
	const summary = part.state?.metadata?.description || part.tool || "";
	const content = JSON.stringify({
		toolName: part.tool,
		toolInput,
		toolOutput,
		status: part.state?.status || "unknown",
		summary,
	});
	const id = `harness-${teammate}-${createdAt}-${part.callID || part.id || Math.random().toString(36).slice(2)}`;
	const activeRooms = getActiveRoomsForTeammate(teammate);
	for (const room of activeRooms) {
		const event: FacadeEvent = {
			type: "message" as const,
			id,
			conversationId: room,
			sender: teammate,
			content,
			timestamp: createdAt,
			toolCall: true,
			summary,
		};
		emitEvent(event);
		if (room.startsWith("huddle-")) {
			const kittyBody = summary
				? `[live-mirror] ${teammate} ${summary}`
				: `[live-mirror] ${teammate} used ${part.tool}\nInput: ${toolInput}\nOutput: ${toolOutput || "(none)"}\nStatus: ${part.state?.status || "unknown"}`;
			const members = getHuddleMembers(room);
			for (const m of members) {
				if (m !== teammate) {
					sendToKitty(m, {
						sender: "system",
						room,
						body: kittyBody,
						timestamp: createdAt,
					}).catch(() => {});
				}
			}
		}
	}
}

function emitTextResponse(
	part: Record<string, unknown>,
	teammate: string,
	createdAt: string
): void {
	const text = part.text || "";
	if (!text.trim()) return;
	const id = `harness-text-${teammate}-${createdAt}-${Math.random().toString(36).slice(2)}`;
	const cleaned = redactCredentials(text);
	const activeRooms = getActiveRoomsForTeammate(teammate);
	for (const room of activeRooms) {
		const event: FacadeEvent = {
			type: "message" as const,
			id,
			conversationId: room,
			sender: teammate,
			content: cleaned,
			timestamp: createdAt,
			response: true,
		};
		emitEvent(event);
	}
}

let lastChecked = Date.now() - 5000;
let watcherCleanup: (() => void) | null = null;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;

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
			if (type !== "tool" && type !== "text") continue;
			if (type === "text" && part.role !== "assistant") continue;
			const teammate = teammateNames.get(part.session_id) || "unknown";
			const createdAt = new Date(part.time_created).toISOString();
			if (type === "tool") {
				emitToolCall(parsed, part.session_id, teammate, createdAt);
			} else if (type === "text") {
				emitTextResponse(parsed, teammate, createdAt);
			}
			if (part.time_created > lastChecked) {
				lastChecked = part.time_created;
			}
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
	if (watcherCleanup) return;
	if (!fs.existsSync(OPENCODE_DB)) {
		console.error("harness-reader: OpenCode DB not found at", OPENCODE_DB);
		return;
	}
	checkOpenCodeDb();
	const watcher = fs.watch(OPENCODE_DB, (eventType) => {
		if (eventType === "change") onDbChange();
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
	}, 5000);
	const origCleanup = watcherCleanup;
	watcherCleanup = () => {
		origCleanup();
		clearInterval(interval);
	};
}

export function stopHarnessReader(): void {
	if (watcherCleanup) {
		watcherCleanup();
		watcherCleanup = null;
	}
}
