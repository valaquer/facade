import type { RequestHandler } from "./$types";
import { sendToKitty } from "$lib/server/kitten";
import { emitEvent } from "$lib/server/events";
import { v4 } from "uuid";
import { getActiveTeammates } from "$lib/server/active-teammates";

interface StoredMessage {
	id: string;
	conversationId: string;
	sender: string;
	content: string;
	createdAt: string;
}

const messages = new Map<string, StoredMessage[]>();

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
	const msg: StoredMessage = { id, conversationId: room, sender, content: body, createdAt };

	const existing = messages.get(room) ?? [];
	existing.push(msg);
	messages.set(room, existing);

	emitEvent({
		type: "message",
		conversationId: room,
		sender,
		content: body,
		timestamp: createdAt,
	});

	// If this is a Boss→teammate message, deliver to Kitty
	if (sender === "boss") {
		const targetTeammate = room.replace(/^direct-/, "").toLowerCase();
		const active = getActiveTeammates();
		if (active.includes(targetTeammate)) {
			sendToKitty(targetTeammate, `[${sender}] ${body}`).catch(() => {});
		}
	}

	return new Response(
		JSON.stringify({ id, conversationId: room, sender, content: body, createdAt }),
		{
			headers: { "Content-Type": "application/json" },
		}
	);
};
