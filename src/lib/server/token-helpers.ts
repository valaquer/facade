import {
	releaseToken,
	clearAllTokens,
	getTokenHolder,
	getHuddleMembers,
	saveMessage,
	getPendingMessages,
	getAllPendingMessages,
	deletePendingMessages,
	deleteAllPendingMessages,
} from "./facade-db";
import { emitEvent } from "./events";
import { sendToKitty } from "./kitten";
import { v4 } from "uuid";

const tokenTimers = new Map<string, NodeJS.Timeout>();

function deliverPending(roomId: string, sender: string): void {
	const pending = getPendingMessages(roomId, sender);
	if (pending.length === 0) return;
	const members = getHuddleMembers(roomId);
	for (const pm of pending) {
		saveMessage({
			id: pm.id,
			conversationId: roomId,
			sender: pm.sender,
			content: pm.content,
			createdAt: pm.createdAt,
			type: "message",
		});
		emitEvent({
			type: "message",
			conversationId: roomId,
			sender: pm.sender,
			content: pm.content,
			timestamp: pm.createdAt,
		});
		for (const m of members) {
			if (m !== pm.sender) {
				sendToKitty(m, {
					sender: pm.sender,
					room: roomId,
					body: pm.content,
					timestamp: pm.createdAt,
				}).catch(() => {});
			}
		}
	}
	deletePendingMessages(roomId, sender);
}

export function deliverAllPending(roomId: string): void {
	const pending = getAllPendingMessages(roomId);
	if (pending.length === 0) return;
	const members = getHuddleMembers(roomId);
	for (const pm of pending) {
		saveMessage({
			id: pm.id,
			conversationId: roomId,
			sender: pm.sender,
			content: pm.content,
			createdAt: pm.createdAt,
			type: "message",
		});
		emitEvent({
			type: "message",
			conversationId: roomId,
			sender: pm.sender,
			content: pm.content,
			timestamp: pm.createdAt,
		});
		for (const m of members) {
			if (m !== pm.sender) {
				sendToKitty(m, {
					sender: pm.sender,
					room: roomId,
					body: pm.content,
					timestamp: pm.createdAt,
				}).catch(() => {});
			}
		}
	}
	deleteAllPendingMessages(roomId);
}

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

	// Deliver any held messages for the new token holder
	deliverPending(roomId, next);

	return next;
}

export function clearTokensAndNotify(roomId: string): void {
	// Deliver all held messages before clearing — don't discard teammate work
	deliverAllPending(roomId);
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
	}, 30_000);
	tokenTimers.set(roomId, timer);
}

export function clearTokenTimer(roomId: string): void {
	const timer = tokenTimers.get(roomId);
	if (timer) {
		clearTimeout(timer);
		tokenTimers.delete(roomId);
	}
}
