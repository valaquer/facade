import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

const DB_DIR = "/Users/d.patnaik/honeybloom/library/facade";
const DB_PATH = path.join(DB_DIR, "facade.db");

interface StoredMessage {
	id: string;
	conversationId: string;
	sender: string;
	content: string;
	createdAt: string;
	type: string;
}

interface RoomRow {
	id: string;
	type: string;
	name: string;
	participants: string;
	originalRoomId: string | null;
	lastActivity: string;
	startedAt: string;
}

let db: Database.Database;

export function formatTimestamp(date: Date): string {
	const y = date.getFullYear();
	const m = String(date.getMonth() + 1).padStart(2, "0");
	const d = String(date.getDate()).padStart(2, "0");
	const h = String(date.getHours()).padStart(2, "0");
	const min = String(date.getMinutes()).padStart(2, "0");
	const s = String(date.getSeconds()).padStart(2, "0");
	return `${y}${m}${d}-${h}${min}${s}`;
}

export function initDb(): void {
	if (db) return;
	if (!fs.existsSync(DB_DIR)) {
		fs.mkdirSync(DB_DIR, { recursive: true });
	}
	db = new Database(DB_PATH);
	db.pragma("journal_mode = WAL");
	db.exec(`
		CREATE TABLE IF NOT EXISTS messages (
			id TEXT PRIMARY KEY,
			conversationId TEXT NOT NULL,
			sender TEXT NOT NULL,
			content TEXT NOT NULL,
			createdAt TEXT NOT NULL,
			type TEXT NOT NULL DEFAULT 'message'
		)
	`);
	try {
		db.exec(`ALTER TABLE messages ADD COLUMN type TEXT NOT NULL DEFAULT 'message'`);
	} catch {
		// column already exists
	}
	db.exec(`
		CREATE TABLE IF NOT EXISTS rooms (
			id TEXT PRIMARY KEY,
			type TEXT NOT NULL,
			name TEXT NOT NULL,
			participants TEXT DEFAULT '[]',
			originalRoomId TEXT,
			lastActivity TEXT NOT NULL,
			startedAt TEXT NOT NULL
		)
	`);
	try {
		db.exec("ALTER TABLE rooms ADD COLUMN originalRoomId TEXT");
	} catch {
		// column already exists
	}
	db.exec(`
		CREATE TABLE IF NOT EXISTS huddle_tokens (
			roomId TEXT PRIMARY KEY REFERENCES rooms(id),
			tokenHolder TEXT,
			tokenQueue TEXT NOT NULL DEFAULT '[]'
		)
	`);
	db.exec(`
		CREATE TABLE IF NOT EXISTS pending_messages (
			id TEXT PRIMARY KEY,
			roomId TEXT NOT NULL,
			sender TEXT NOT NULL,
			content TEXT NOT NULL,
			createdAt TEXT NOT NULL
		)
	`);
}

export function saveMessage(msg: StoredMessage): void {
	initDb();
	const stmt = db.prepare(
		"INSERT OR IGNORE INTO messages (id, conversationId, sender, content, createdAt, type) VALUES (?, ?, ?, ?, ?, ?)"
	);
	stmt.run(
		msg.id,
		msg.conversationId,
		msg.sender,
		msg.content,
		msg.createdAt,
		msg.type || "message"
	);
}

export function resolveActiveRoom(originalRoomId: string): string | null {
	initDb();
	const stmt = db.prepare(
		"SELECT id FROM rooms WHERE originalRoomId = ? AND type != 'past' ORDER BY startedAt DESC LIMIT 1"
	);
	const row = stmt.get(originalRoomId) as { id: string } | undefined;
	return row?.id ?? null;
}

export function getHuddleMembers(roomId: string): string[] {
	initDb();
	const room = getRoom(roomId);
	if (!room) return [];
	try {
		return JSON.parse(room.participants) as string[];
	} catch {
		return [];
	}
}

export function requestToken(sender: string, roomId: string): string {
	initDb();
	const existing = db
		.prepare("SELECT tokenHolder, tokenQueue FROM huddle_tokens WHERE roomId = ?")
		.get(roomId) as { tokenHolder: string | null; tokenQueue: string } | undefined;
	if (!existing) return "no_huddle";

	const queue: [string, string][] = JSON.parse(existing.tokenQueue);
	const holder = existing.tokenHolder;

	if (holder === sender) return "already_holding: you have the token";
	for (const item of queue) {
		if (item[0] === sender) {
			const pos = queue.indexOf(item) + 1;
			return `already_queued: position ${pos} (of ${queue.length})`;
		}
	}

	if (holder === null && queue.length === 0) {
		db.prepare("UPDATE huddle_tokens SET tokenHolder = ? WHERE roomId = ?").run(sender, roomId);
		return "granted: you have the token";
	}

	queue.push([sender, new Date().toISOString()]);
	db.prepare("UPDATE huddle_tokens SET tokenQueue = ? WHERE roomId = ?").run(
		JSON.stringify(queue),
		roomId
	);
	return `queued: position ${queue.length}`;
}

export function releaseToken(roomId: string, sender: string): string {
	initDb();
	const existing = db
		.prepare("SELECT tokenHolder, tokenQueue FROM huddle_tokens WHERE roomId = ?")
		.get(roomId) as { tokenHolder: string | null; tokenQueue: string } | undefined;
	if (!existing) return "no_huddle";

	if (existing.tokenHolder !== sender) {
		const queue: [string, string][] = JSON.parse(existing.tokenQueue);
		const idx = queue.findIndex((item) => item[0] === sender);
		if (idx >= 0) {
			queue.splice(idx, 1);
			db.prepare("UPDATE huddle_tokens SET tokenQueue = ? WHERE roomId = ?").run(
				JSON.stringify(queue),
				roomId
			);
			return "removed: you left the queue";
		}
		return "not_in_queue";
	}

	const queue: [string, string][] = JSON.parse(existing.tokenQueue);
	if (queue.length > 0) {
		const next = queue.shift();
		if (next) {
			db.prepare("UPDATE huddle_tokens SET tokenHolder = ?, tokenQueue = ? WHERE roomId = ?").run(
				next[0],
				JSON.stringify(queue),
				roomId
			);
			return `released: token advanced to ${next[0]}`;
		}
	}

	db.prepare("UPDATE huddle_tokens SET tokenHolder = NULL, tokenQueue = '[]' WHERE roomId = ?").run(
		roomId
	);
	return "forfeited: token released (queue empty)";
}

export function initHuddleToken(roomId: string): void {
	initDb();
	db.prepare("INSERT OR IGNORE INTO huddle_tokens (roomId) VALUES (?)").run(roomId);
}

export function getMessages(conversationId: string): StoredMessage[] {
	initDb();
	const stmt = db.prepare("SELECT * FROM messages WHERE conversationId = ? ORDER BY createdAt ASC");
	return stmt.all(conversationId) as StoredMessage[];
}

export function saveRoom(room: {
	id: string;
	type: string;
	name: string;
	participants?: string[];
	originalRoomId?: string;
	lastActivity: string;
	startedAt: string;
}): void {
	initDb();
	const stmt = db.prepare(
		"INSERT OR REPLACE INTO rooms (id, type, name, participants, originalRoomId, lastActivity, startedAt) VALUES (?, ?, ?, ?, ?, ?, ?)"
	);
	stmt.run(
		room.id,
		room.type,
		room.name,
		JSON.stringify(room.participants ?? []),
		room.originalRoomId ?? null,
		room.lastActivity,
		room.startedAt
	);
}

export function roomExists(id: string): boolean {
	initDb();
	const stmt = db.prepare("SELECT 1 FROM rooms WHERE id = ?");
	return !!stmt.get(id);
}

export function clearAllTokens(roomId: string): void {
	initDb();
	db.prepare("UPDATE huddle_tokens SET tokenHolder = NULL, tokenQueue = '[]' WHERE roomId = ?").run(
		roomId
	);
}

export function getTokenHolder(roomId: string): string | null {
	initDb();
	const row = db.prepare("SELECT tokenHolder FROM huddle_tokens WHERE roomId = ?").get(roomId) as
		| { tokenHolder: string | null }
		| undefined;
	return row?.tokenHolder ?? null;
}

export function getRoom(id: string): RoomRow | undefined {
	initDb();
	const stmt = db.prepare("SELECT * FROM rooms WHERE id = ?");
	return stmt.get(id) as RoomRow | undefined;
}

export function getOriginalRoomId(pastRoomId: string): string | null {
	initDb();
	const stmt = db.prepare("SELECT originalRoomId FROM rooms WHERE id = ?");
	const row = stmt.get(pastRoomId) as { originalRoomId: string | null } | undefined;
	return row?.originalRoomId ?? null;
}

export function getRoomsByType(type: string): RoomRow[] {
	initDb();
	const stmt = db.prepare("SELECT * FROM rooms WHERE type = ? ORDER BY lastActivity DESC");
	return stmt.all(type) as RoomRow[];
}

export function setRoomType(id: string, type: string): void {
	initDb();
	db.prepare("UPDATE rooms SET type = ? WHERE id = ?").run(type, id);
}

export function getAllRooms(): RoomRow[] {
	initDb();
	const stmt = db.prepare("SELECT * FROM rooms ORDER BY lastActivity DESC");
	return stmt.all() as RoomRow[];
}

export function markRoomPast(id: string, pastId: string, startedAt: string): void {
	initDb();
	const now = new Date().toISOString();
	const stmt = db.prepare(
		"UPDATE rooms SET id = ?, type = 'past', lastActivity = ?, startedAt = ? WHERE id = ?"
	);
	stmt.run(pastId, now, startedAt, id);
}

export function deleteRoom(id: string): void {
	initDb();
	db.prepare("DELETE FROM rooms WHERE id = ?").run(id);
}

export function savePendingMessage(msg: {
	id: string;
	roomId: string;
	sender: string;
	content: string;
	createdAt: string;
}): void {
	initDb();
	db.prepare(
		"INSERT INTO pending_messages (id, roomId, sender, content, createdAt) VALUES (?, ?, ?, ?, ?)"
	).run(msg.id, msg.roomId, msg.sender, msg.content, msg.createdAt);
}

interface PendingMessage {
	id: string;
	roomId: string;
	sender: string;
	content: string;
	createdAt: string;
}

export function getPendingMessages(roomId: string, sender: string): PendingMessage[] {
	initDb();
	return db
		.prepare(
			"SELECT * FROM pending_messages WHERE roomId = ? AND sender = ? ORDER BY createdAt ASC"
		)
		.all(roomId, sender) as PendingMessage[];
}

export function getAllPendingMessages(roomId: string): PendingMessage[] {
	initDb();
	return db
		.prepare("SELECT * FROM pending_messages WHERE roomId = ? ORDER BY createdAt ASC")
		.all(roomId) as PendingMessage[];
}

export function deletePendingMessages(roomId: string, sender: string): void {
	initDb();
	db.prepare("DELETE FROM pending_messages WHERE roomId = ? AND sender = ?").run(roomId, sender);
}

export function deleteAllPendingMessages(roomId: string): void {
	initDb();
	db.prepare("DELETE FROM pending_messages WHERE roomId = ?").run(roomId);
}
