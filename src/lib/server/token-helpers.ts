import {
	releaseToken,
	clearAllTokens,
	getTokenHolder,
	getHuddleMembers,
	saveMessage,
} from "./facade-db";
import { emitEvent } from "./events";
import { sendToKitty } from "./kitten";
import { v4 } from "uuid";

const tokenTimers = new Map<string, NodeJS.Timeout>();

export function advanceTokenAndNotify(roomId: string, releasedBy: string): string | null {
	const result = releaseToken(roomId, releasedBy);
	if (!result.startsWith("released:")) return null;

	const next = result.replace("released: token advanced to ", "");
	const members = getHuddleMembers(roomId);
	const now = new Date().toISOString();

	const sysMsg = {
		id: v4(),
		conversationId: roomId,
		sender: "system",
		content: `Token passed to ${next}`,
		createdAt: now,
		type: "message",
	};
	saveMessage(sysMsg);
	emitEvent({
		type: "message",
		conversationId: roomId,
		sender: "system",
		content: `Token passed to ${next}`,
		timestamp: now,
	});

	for (const m of members) {
		sendToKitty(m, {
			sender: "system",
			room: roomId,
			body: `Token passed to ${next}`,
			timestamp: now,
		}).catch(() => {});
	}

	return next;
}

export function clearTokensAndNotify(roomId: string): void {
	clearAllTokens(roomId);
	const members = getHuddleMembers(roomId);
	const now = new Date().toISOString();

	const content = "Boss spoke \u2013 token released. Request to speak.";
	const sysMsg = {
		id: v4(),
		conversationId: roomId,
		sender: "system",
		content,
		createdAt: now,
		type: "message",
	};
	saveMessage(sysMsg);
	emitEvent({
		type: "message",
		conversationId: roomId,
		sender: "system",
		content,
		timestamp: now,
	});

	for (const m of members) {
		sendToKitty(m, {
			sender: "system",
			room: roomId,
			body: content,
			timestamp: now,
		}).catch(() => {});
	}
}

export function startTokenTimer(roomId: string): void {
	clearTokenTimer(roomId);
	const timer = setTimeout(() => {
		tokenTimers.delete(roomId);
		const holder = getTokenHolder(roomId);
		if (!holder) return;
		const next = advanceTokenAndNotify(roomId, holder);
		if (next) {
			startTokenTimer(roomId);
		}
	}, 10_000);
	tokenTimers.set(roomId, timer);
}

export function clearTokenTimer(roomId: string): void {
	const timer = tokenTimers.get(roomId);
	if (timer) {
		clearTimeout(timer);
		tokenTimers.delete(roomId);
	}
}
