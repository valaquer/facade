import { releaseToken, clearAllTokens, getTokenHolder, getHuddleMembers } from "./facade-db";
import { sendToKitty } from "./kitten";

const tokenTimers = new Map<string, NodeJS.Timeout>();

export function advanceTokenAndNotify(roomId: string, releasedBy: string): string | null {
	const result = releaseToken(roomId, releasedBy);
	if (!result.startsWith("released:")) return null;

	const next = result.replace("released: token advanced to ", "");
	const members = getHuddleMembers(roomId);
	const now = new Date().toISOString();

	// Token notifications go to Kitty only — not saved or displayed in Facade (REQ-77)
	for (const m of members) {
		sendToKitty(m, {
			sender: "system",
			room: roomId,
			body: `Token passed to ${next}. Read posted messages before posting. Agree or disagree but don't repeat what is already said.`,
			timestamp: now,
		}).catch(() => {});
	}

	return next;
}

export function clearTokensAndNotify(roomId: string): void {
	clearAllTokens(roomId);
	const members = getHuddleMembers(roomId);
	const now = new Date().toISOString();

	const content = "Token available, if you wish to speak.";

	// Token notifications go to Kitty only — not saved or displayed in Facade (REQ-77)
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
