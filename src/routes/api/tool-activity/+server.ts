import type { RequestHandler } from "./$types";
import { emitEvent } from "$lib/server/events";
import { saveMessage, getHuddleMembers, getActiveRoomsForTeammate } from "$lib/server/facade-db";
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

	const activeRooms = getActiveRoomsForTeammate(sender);
	if (activeRooms.length === 0) activeRooms.push(room); // fallback
	const createdAt = new Date().toISOString();
	const content = JSON.stringify({ toolName, toolInput, toolOutput, status });

	// Save + emit to every room the teammate is in
	for (const targetRoom of activeRooms) {
		const id = v4();
		saveMessage({
			id,
			conversationId: targetRoom,
			sender,
			content,
			createdAt,
			type: "tool_call",
		});

		emitEvent({
			type: "message",
			conversationId: targetRoom,
			sender,
			content,
			timestamp: createdAt,
			toolCall: true,
		});

		// Kitty fan-out for huddle rooms (REQ-81)
		if (targetRoom.startsWith("huddle-")) {
			const inputStr =
				typeof toolInput === "string" ? toolInput : JSON.stringify(toolInput, null, 2);
			const body = `[live-mirror] ${sender} used ${toolName}\nInput: ${inputStr}\nOutput: ${toolOutput || "(none)"}\nStatus: ${status}`;
			const members = getHuddleMembers(targetRoom);
			for (const m of members) {
				if (m !== sender) {
					sendToKitty(m, { sender: "system", room: targetRoom, body, timestamp: createdAt }).catch(
						() => {}
					);
				}
			}
		}
	}

	return new Response(JSON.stringify({ sender, toolName, status, createdAt, rooms: activeRooms }), {
		headers: { "Content-Type": "application/json" },
	});
};
