import type { RequestHandler } from "./$types";
import { sendToKitty } from "$lib/server/kitten";
import { emitEvent } from "$lib/server/events";
import {
	saveMessage,
	resolveActiveRoom,
	saveRoom,
	formatTimestamp,
	roomExists,
	getHuddleMembers,
	releaseToken,
} from "$lib/server/facade-db";
import { v4 } from "uuid";
import fs from "fs";

interface StoredMessage {
	id: string;
	conversationId: string;
	sender: string;
	content: string;
	createdAt: string;
	type: string;
}

export const POST: RequestHandler = async ({ request }) => {
	const { sender, body, room } = await request.json();

	if (!sender || !body || !room) {
		return new Response(JSON.stringify({ error: "Missing sender, body, or room" }), {
			status: 400,
			headers: { "Content-Type": "application/json" },
		});
	}

	const id = v4();
	const createdAt = new Date().toISOString();

	let resolvedRoom = room === "direct-boss" ? `direct-${sender}` : room;
	if (!roomExists(resolvedRoom)) {
		const activeRoom = resolveActiveRoom(resolvedRoom);
		if (activeRoom) {
			resolvedRoom = activeRoom;
		} else {
			const ts = formatTimestamp(new Date());
			const name = resolvedRoom.replace("direct-", "");
			resolvedRoom = `direct-${name}-${ts}`;
			saveRoom({
				id: resolvedRoom,
				type: "teammate",
				name,
				originalRoomId: `direct-${name}`,
				lastActivity: createdAt,
				startedAt: createdAt,
			});
		}
	}

	// --- Command handling ---
	if (body.startsWith("/")) {
		const parts = body.trim().split(/\s+/);
		const command = parts[0].toLowerCase();
		let systemContent = "";

		if (command === "/start-livemirror") {
			const teammates = parts.slice(1).filter((t: string) => t.length > 0);
			for (const t of teammates) {
				fs.writeFileSync(`/tmp/facade-relay-active-${t}`, resolvedRoom);
			}
			systemContent =
				teammates.length > 0
					? `Live mirror started for: ${teammates.join(", ")}`
					: "Live mirror: no teammates specified";
		} else if (command === "/end-livemirror") {
			try {
				const dir = fs.readdirSync("/tmp");
				for (const f of dir) {
					if (f.startsWith("facade-relay-active-")) {
						fs.unlinkSync(`/tmp/${f}`);
					}
				}
			} catch {
				// ignore
			}
			systemContent = "Live mirror stopped";
		}

		if (systemContent) {
			const sysMsg: StoredMessage = {
				id,
				conversationId: resolvedRoom,
				sender: "system",
				content: systemContent,
				createdAt,
				type: "message",
			};
			saveMessage(sysMsg);
			emitEvent({
				type: "message",
				conversationId: resolvedRoom,
				sender: "system",
				content: systemContent,
				timestamp: createdAt,
			});
			return new Response(
				JSON.stringify({
					id,
					conversationId: resolvedRoom,
					sender: "system",
					content: systemContent,
					createdAt,
				}),
				{
					headers: { "Content-Type": "application/json" },
				}
			);
		}
		// Unknown command — fall through to regular message handling
	}

	const msg: StoredMessage = {
		id,
		conversationId: resolvedRoom,
		sender,
		content: body,
		createdAt,
		type: "message",
	};

	saveMessage(msg);

	emitEvent({
		type: "message",
		conversationId: resolvedRoom,
		sender,
		content: body,
		timestamp: createdAt,
	});

	// System messages are Facade-only — no Kitty forwarding
	if (sender === "system") {
		return new Response(
			JSON.stringify({ id, conversationId: resolvedRoom, sender, content: body, createdAt }),
			{
				headers: { "Content-Type": "application/json" },
			}
		);
	}

	// Fan-out for huddle rooms: deliver to all members
	if (resolvedRoom.startsWith("huddle-")) {
		const members = getHuddleMembers(resolvedRoom);
		for (const m of members) {
			if (m !== sender) {
				sendToKitty(m, { sender, room: resolvedRoom, body, timestamp: createdAt }).catch(() => {});
			}
		}
		// Auto-release token if sender holds it
		const releaseResult = releaseToken(resolvedRoom, sender);
		if (releaseResult.startsWith("released:")) {
			const next = releaseResult.replace("released: token advanced to ", "");
			const sysMsg = {
				id: v4(),
				conversationId: resolvedRoom,
				sender: "system",
				content: `Token passed to ${next}`,
				createdAt: new Date().toISOString(),
				type: "message",
			};
			saveMessage(sysMsg);
			emitEvent({
				type: "message",
				conversationId: resolvedRoom,
				sender: "system",
				content: `Token passed to ${next}`,
				timestamp: sysMsg.createdAt,
			});
		}
	} else {
		// Deliver to the room owner's Kitty tab, unless the sender owns the room
		const nameMatch = resolvedRoom.match(/^direct-(.+?)-\d{8}-\d{6}$/);
		const targetTeammate = (
			nameMatch ? nameMatch[1] : resolvedRoom.replace(/^direct-/, "")
		).toLowerCase();
		if (targetTeammate !== sender) {
			sendToKitty(targetTeammate, { sender, room: resolvedRoom, body, timestamp: createdAt }).catch(
				() => {}
			);
		}
	}

	return new Response(
		JSON.stringify({ id, conversationId: resolvedRoom, sender, content: body, createdAt }),
		{
			headers: { "Content-Type": "application/json" },
		}
	);
};
