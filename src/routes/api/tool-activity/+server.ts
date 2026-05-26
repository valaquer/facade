import type { RequestHandler } from "./$types";
import { emitEvent } from "$lib/server/events";
import { saveMessage, getHuddleMembers, getActiveRoomsForTeammate } from "$lib/server/facade-db";
import { sendToKitty } from "$lib/server/kitten";
import { v4 } from "uuid";

export const POST: RequestHandler = async ({ request }) => {
	const data = await request.json();
	const { sender, room, body } = data;

	if (!sender || !room) {
		return new Response(JSON.stringify({ error: "Missing sender or room" }), {
			status: 400,
			headers: { "Content-Type": "application/json" },
		});
	}

	const isResponse = !data.toolName && body;
	const isToolCall = data.toolName;

	if (!isResponse && !isToolCall) {
		return new Response(JSON.stringify({ error: "Provide toolName + tool fields, or body" }), {
			status: 400,
			headers: { "Content-Type": "application/json" },
		});
	}

	const activeRooms = getActiveRoomsForTeammate(sender);
	if (activeRooms.length === 0) activeRooms.push(room);

	const createdAt = new Date().toISOString();
	const content = isToolCall
		? JSON.stringify({
				toolName: data.toolName,
				toolInput: data.toolInput,
				toolOutput: data.toolOutput,
				status: data.status,
			})
		: body;
	const msgType = isToolCall ? "tool_call" : "response";
	const toolCallFlag = isToolCall;

	for (const targetRoom of activeRooms) {
		const id = v4();
		saveMessage({
			id,
			conversationId: targetRoom,
			sender,
			content,
			createdAt,
			type: msgType,
		});

		emitEvent({
			type: "message",
			conversationId: targetRoom,
			sender,
			content,
			timestamp: createdAt,
			toolCall: toolCallFlag,
		});

		if (targetRoom.startsWith("huddle-")) {
			const kittyBody = isToolCall
				? `[live-mirror] ${sender} used ${data.toolName}\nInput: ${typeof data.toolInput === "string" ? data.toolInput : JSON.stringify(data.toolInput, null, 2)}\nOutput: ${data.toolOutput || "(none)"}\nStatus: ${data.status}`
				: body;
			const members = getHuddleMembers(targetRoom);
			for (const m of members) {
				if (m !== sender) {
					sendToKitty(m, {
						sender: "system",
						room: targetRoom,
						body: kittyBody,
						timestamp: createdAt,
					}).catch(() => {});
				}
			}
		}
	}

	const resData = isToolCall
		? { sender, toolName: data.toolName, status: data.status, createdAt, rooms: activeRooms }
		: { sender, createdAt, rooms: activeRooms };
	return new Response(JSON.stringify(resData), {
		headers: { "Content-Type": "application/json" },
	});
};
