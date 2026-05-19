import type { RequestHandler } from "./$types";
import { emitEvent } from "$lib/server/events";
import { saveMessage, getHuddleMembers, resolveActiveRoom } from "$lib/server/facade-db";
import { sendToKitty } from "$lib/server/kitten";
import { v4 } from "uuid";

export const POST: RequestHandler = async ({ request }) => {
	const { sender, room, toolName, toolInput, toolOutput, status } = await request.json();

	if (!sender || !room || !toolName) {
		return new Response(JSON.stringify({ error: "Missing sender, room, or toolName" }), {
			status: 400,
			headers: { "Content-Type": "application/json" },
		});
	}

	const resolvedRoom = resolveActiveRoom(room) ?? room;
	const id = v4();
	const createdAt = new Date().toISOString();
	const content = JSON.stringify({ toolName, toolInput, toolOutput, status });

	saveMessage({
		id,
		conversationId: resolvedRoom,
		sender,
		content,
		createdAt,
		type: "tool_call",
	});

	emitEvent({
		type: "message",
		conversationId: resolvedRoom,
		sender,
		content,
		timestamp: createdAt,
		toolCall: true,
	});

	// Fan-out to huddle participants' Kitty tabs (REQ-81)
	if (room.startsWith("huddle-")) {
		const inputStr = typeof toolInput === "string" ? toolInput : JSON.stringify(toolInput, null, 2);
		const body = `[live-mirror] ${sender} used ${toolName}\nInput: ${inputStr}\nOutput: ${toolOutput || "(none)"}\nStatus: ${status}`;
		const members = getHuddleMembers(room);
		for (const m of members) {
			if (m !== sender) {
				sendToKitty(m, { sender: "system", room, body, timestamp: createdAt }).catch(() => {});
			}
		}
	}

	return new Response(
		JSON.stringify({ id, conversationId: resolvedRoom, sender, toolName, status, createdAt }),
		{
			headers: { "Content-Type": "application/json" },
		}
	);
};
