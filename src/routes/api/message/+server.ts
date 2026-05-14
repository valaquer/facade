import type { RequestHandler } from "./$types";
import { sendToKitty } from "$lib/server/kitten";
import { emitEvent } from "$lib/server/events";
import { saveMessage } from "$lib/server/facade-db";
import { v4 } from "uuid";
import fs from "fs";

const HUDDLE_STATE_FILE = "/tmp/kitty-huddles.json";

interface StoredMessage {
	id: string;
	conversationId: string;
	sender: string;
	content: string;
	createdAt: string;
}

export const POST: RequestHandler = async ({ request }) => {
	const { sender, body, room } = await request.json();

	if (!sender || !body || !room) {
		return new Response(JSON.stringify({ error: "Missing sender, body, or room" }), {
			status: 400,
			headers: { "Content-Type": "application/json" },
		});
	}

	const resolvedRoom = room === "direct-boss" ? `direct-${sender}` : room;

	const id = v4();
	const createdAt = new Date().toISOString();
	const msg: StoredMessage = { id, conversationId: resolvedRoom, sender, content: body, createdAt };

	saveMessage(msg);

	emitEvent({
		type: "message",
		conversationId: resolvedRoom,
		sender,
		content: body,
		timestamp: createdAt,
	});

	// Fan-out for huddle rooms: deliver to all members
	if (resolvedRoom.startsWith("huddle-")) {
		const hostKey = resolvedRoom.replace("huddle-", "").toLowerCase();
		try {
			const raw = fs.readFileSync(HUDDLE_STATE_FILE, "utf-8");
			const state = JSON.parse(raw);
			const entry = state[hostKey];
			if (entry) {
				const members = [entry.host, ...entry.participants];
				for (const m of members) {
					if (m !== sender) {
						sendToKitty(m, { sender, room: resolvedRoom, body, timestamp: createdAt }).catch(
							() => {}
						);
					}
				}
			}
		} catch {
			// huddle state file missing or corrupt — no delivery
		}
	} else {
		// Deliver to the room owner's Kitty tab, unless the sender owns the room
		const targetTeammate = resolvedRoom.replace(/^direct-/, "").toLowerCase();
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
