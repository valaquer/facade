import { clearTokenTimer } from "./token-helpers";
import { setRoomType, getHuddleMembers, getRoom, saveMessage } from "./facade-db";
import { emitEvent } from "./events";
import { sendToKitty } from "./kitten";
import { v4 } from "uuid";

export function endHuddle(roomId: string): void {
	const room = getRoom(roomId);
	if (!room) return;

	clearTokenTimer(roomId);

	const members = getHuddleMembers(roomId);

	setRoomType(roomId, "past");
	emitEvent({ type: "huddle_update" });

	const notification = `Huddle ${roomId} has ended.`;
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

	for (const name of members) {
		sendToKitty(name, {
			sender: "system",
			room: roomId,
			body: notification,
			timestamp: msg.createdAt,
		}).catch(() => {});
	}
}
