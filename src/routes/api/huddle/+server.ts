import type { RequestHandler } from "./$types";
import {
	saveRoom,
	setRoomType,
	saveMessage,
	getHuddleMembers,
	getRoom,
	formatTimestamp,
	requestToken,
	releaseToken,
	initHuddleToken,
} from "$lib/server/facade-db";
import { emitEvent } from "$lib/server/events";
import { sendToKitty } from "$lib/server/kitten";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import { v4 } from "uuid";

const execAsync = promisify(exec);

async function tabExists(name: string): Promise<boolean> {
	try {
		const { stdout } = await execAsync("kitten @ ls", { timeout: 5000 });
		const data = JSON.parse(stdout);
		for (const osWin of data) {
			for (const tab of osWin.tabs || []) {
				for (const window of tab.windows || []) {
					if (window.user_vars?.teammate === name) return true;
				}
			}
		}
	} catch {}
	return false;
}

async function autoWake(name: string): Promise<string> {
	try {
		await execAsync(
			`/Users/d.patnaik/honeybloom/chica/scripts/kitty-open-teammate.sh --solo ${name}`,
			{ timeout: 15000 }
		);
		for (let i = 0; i < 60; i++) {
			if (await tabExists(name)) return "ready";
			await new Promise((r) => setTimeout(r, 500));
		}
		await new Promise((r) => setTimeout(r, 30000));
		if (await tabExists(name)) return "ready";
		return "wake_failed";
	} catch {
		return "wake_failed";
	}
}

async function ensureTabOpen(name: string): Promise<string> {
	const exists = await tabExists(name);
	if (!exists) return await autoWake(name);
	return "already_open";
}

export const POST: RequestHandler = async ({ request }) => {
	const { action, host, participants, sender, roomId } = await request.json();

	if (action === "start") {
		if (!host || !participants || !Array.isArray(participants)) {
			return new Response(JSON.stringify({ error: "Missing host or participants" }), {
				status: 400,
			});
		}

		const ts = formatTimestamp(new Date());
		const rid = `huddle-${host}-${ts}`;
		const allMembers = [host, ...participants.filter((p: string) => p !== host)];

		saveRoom({
			id: rid,
			type: "huddle",
			name: host,
			participants: allMembers,
			lastActivity: new Date().toISOString(),
			startedAt: new Date().toISOString(),
		});
		initHuddleToken(rid);

		emitEvent({ type: "huddle_update" });

		const results: string[] = [];
		for (const name of allMembers) {
			const wakeResult = await ensureTabOpen(name);
			results.push(`${name}: ${wakeResult}`);
		}

		const invitation = `System notification: Huddle started by ${host}. Participants: ${allMembers.join(", ")}. Room: ${rid}`;
		const msg = {
			id: v4(),
			conversationId: rid,
			sender: "system",
			content: invitation,
			createdAt: new Date().toISOString(),
			type: "message",
		};
		saveMessage(msg);
		emitEvent({
			type: "message",
			conversationId: rid,
			sender: "system",
			content: invitation,
			timestamp: msg.createdAt,
		});

		for (const name of allMembers) {
			if (name === host) continue;
			sendToKitty(name, {
				sender: "system",
				room: rid,
				body: invitation,
				timestamp: msg.createdAt,
			}).catch(() => {});
		}

		return new Response(JSON.stringify({ roomId: rid, results }), {
			headers: { "Content-Type": "application/json" },
		});
	}

	if (action === "end") {
		if (!roomId) return new Response(JSON.stringify({ error: "Missing roomId" }), { status: 400 });

		const room = getRoom(roomId);
		if (!room) return new Response(JSON.stringify({ error: "Room not found" }), { status: 404 });

		setRoomType(roomId, "past");
		emitEvent({ type: "huddle_update" });

		const notification = `System notification: Huddle ${roomId} has ended.`;
		const msg = {
			id: v4(),
			conversationId: roomId,
			sender: "system",
			content: notification,
			createdAt: new Date().toISOString(),
			type: "message",
		};
		saveMessage(msg);
		emitEvent({
			type: "message",
			conversationId: roomId,
			sender: "system",
			content: notification,
			timestamp: msg.createdAt,
		});

		const members = getHuddleMembers(roomId);
		for (const name of members) {
			sendToKitty(name, {
				sender: "system",
				room: roomId,
				body: notification,
				timestamp: msg.createdAt,
			}).catch(() => {});
		}

		return new Response(JSON.stringify({ status: "ended", roomId }), {
			headers: { "Content-Type": "application/json" },
		});
	}

	if (action === "add") {
		if (!roomId || !participants || !Array.isArray(participants)) {
			return new Response(JSON.stringify({ error: "Missing roomId or participants" }), {
				status: 400,
			});
		}

		const room = getRoom(roomId);
		if (!room) return new Response(JSON.stringify({ error: "Room not found" }), { status: 404 });

		const current = getHuddleMembers(roomId);
		const updated = [...new Set([...current, ...participants])];
		saveRoom({
			id: roomId,
			type: "huddle",
			name: room.name,
			participants: updated,
			lastActivity: new Date().toISOString(),
			startedAt: room.startedAt,
		});

		emitEvent({ type: "huddle_update" });

		// Auto-wake new participants
		for (const name of participants) {
			await ensureTabOpen(name);
		}

		const notification = `System notification: ${participants.join(", ")} added to huddle ${roomId}.`;
		const msg = {
			id: v4(),
			conversationId: roomId,
			sender: "system",
			content: notification,
			createdAt: new Date().toISOString(),
			type: "message",
		};
		saveMessage(msg);
		emitEvent({
			type: "message",
			conversationId: roomId,
			sender: "system",
			content: notification,
			timestamp: msg.createdAt,
		});

		for (const name of updated) {
			sendToKitty(name, {
				sender: "system",
				room: roomId,
				body: notification,
				timestamp: msg.createdAt,
			}).catch(() => {});
		}

		return new Response(JSON.stringify({ status: "added", roomId, participants: updated }), {
			headers: { "Content-Type": "application/json" },
		});
	}

	if (action === "remove") {
		if (!roomId || !participants || !Array.isArray(participants)) {
			return new Response(JSON.stringify({ error: "Missing roomId or participants" }), {
				status: 400,
			});
		}

		const room = getRoom(roomId);
		if (!room) return new Response(JSON.stringify({ error: "Room not found" }), { status: 404 });

		const current = getHuddleMembers(roomId);
		const updated = current.filter((m: string) => !participants.includes(m));
		if (updated.length === 0) {
			setRoomType(roomId, "past");
			emitEvent({ type: "huddle_update" });
			return new Response(
				JSON.stringify({ status: "ended", roomId, reason: "no_participants_left" }),
				{
					headers: { "Content-Type": "application/json" },
				}
			);
		}

		saveRoom({
			id: roomId,
			type: "huddle",
			name: room.name,
			participants: updated,
			lastActivity: new Date().toISOString(),
			startedAt: room.startedAt,
		});

		emitEvent({ type: "huddle_update" });

		// Release token if removed participant held it
		for (const p of participants) {
			releaseToken(roomId, p);
		}

		const notification = `System notification: ${participants.join(", ")} removed from huddle ${roomId}.`;
		const msg = {
			id: v4(),
			conversationId: roomId,
			sender: "system",
			content: notification,
			createdAt: new Date().toISOString(),
			type: "message",
		};
		saveMessage(msg);
		emitEvent({
			type: "message",
			conversationId: roomId,
			sender: "system",
			content: notification,
			timestamp: msg.createdAt,
		});

		for (const name of updated) {
			sendToKitty(name, {
				sender: "system",
				room: roomId,
				body: notification,
				timestamp: msg.createdAt,
			}).catch(() => {});
		}

		return new Response(JSON.stringify({ status: "removed", roomId, participants: updated }), {
			headers: { "Content-Type": "application/json" },
		});
	}

	if (action === "request") {
		if (!sender || !roomId) {
			return new Response(JSON.stringify({ error: "Missing sender or roomId" }), { status: 400 });
		}
		const result = requestToken(sender, roomId);
		return new Response(JSON.stringify({ result }), {
			headers: { "Content-Type": "application/json" },
		});
	}

	if (action === "release") {
		if (!sender || !roomId) {
			return new Response(JSON.stringify({ error: "Missing sender or roomId" }), { status: 400 });
		}
		const result = releaseToken(roomId, sender);
		return new Response(JSON.stringify({ result }), {
			headers: { "Content-Type": "application/json" },
		});
	}

	return new Response(JSON.stringify({ error: "Unknown action" }), { status: 400 });
};
