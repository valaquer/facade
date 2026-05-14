import type { RequestHandler } from "./$types";
import { emitEvent } from "$lib/server/events";
import { saveMessage } from "$lib/server/facade-db";
import { v4 } from "uuid";

export const POST: RequestHandler = async ({ request }) => {
	const { sender, room, toolName, toolInput, toolOutput, status } = await request.json();

	if (!sender || !room || !toolName) {
		return new Response(JSON.stringify({ error: "Missing sender, room, or toolName" }), {
			status: 400,
			headers: { "Content-Type": "application/json" },
		});
	}

	const id = v4();
	const createdAt = new Date().toISOString();
	const content = JSON.stringify({ toolName, toolInput, toolOutput, status });

	saveMessage({
		id,
		conversationId: room,
		sender,
		content,
		createdAt,
		type: "tool_call",
	});

	emitEvent({
		type: "message",
		conversationId: room,
		sender,
		content,
		timestamp: createdAt,
		toolCall: true,
	});

	return new Response(
		JSON.stringify({ id, conversationId: room, sender, toolName, status, createdAt }),
		{
			headers: { "Content-Type": "application/json" },
		}
	);
};
