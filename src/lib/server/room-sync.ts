import { getActiveTeammatesFromKitty } from "./kitten";
import { getActiveTeammates, activateTeammate, deactivateTeammate } from "./active-teammates";
import { emitEvent } from "./events";
import { saveRoom, roomExists, getMessages } from "./facade-db";
import fs from "fs";

const POLL_INTERVAL = 3000;
const HUDDLE_STATE_FILE = "/tmp/kitty-huddles.json";

let intervalHandle: ReturnType<typeof setInterval> | null = null;
let lastHuddleState = "";

function formatTimestamp(date: Date): string {
	const y = date.getFullYear();
	const m = String(date.getMonth() + 1).padStart(2, "0");
	const d = String(date.getDate()).padStart(2, "0");
	const h = String(date.getHours()).padStart(2, "0");
	const min = String(date.getMinutes()).padStart(2, "0");
	const s = String(date.getSeconds()).padStart(2, "0");
	return `${y}${m}${d}-${h}${min}${s}`;
}

export function startRoomSync(): void {
	if (intervalHandle) return;
	syncOnce();
	intervalHandle = setInterval(syncOnce, POLL_INTERVAL);
}

export function stopRoomSync(): void {
	if (intervalHandle) {
		clearInterval(intervalHandle);
		intervalHandle = null;
	}
}

async function syncOnce(): Promise<void> {
	const kittyTeammates = await getActiveTeammatesFromKitty();
	const prevActive = getActiveTeammates();

	let changed = false;

	for (const name of kittyTeammates) {
		if (!prevActive.includes(name)) {
			activateTeammate(name);
			changed = true;
		}
	}

	for (const name of prevActive) {
		if (!kittyTeammates.includes(name)) {
			const pastId = `direct-${name}-${formatTimestamp(new Date())}`;
			const roomId = `direct-${name}`;

			if (!roomExists(pastId)) {
				const msgs = getMessages(roomId);
				const startedAt = msgs.length > 0 ? msgs[0].createdAt : new Date().toISOString();
				saveRoom({
					id: pastId,
					type: "past",
					name: `${name}-${formatTimestamp(new Date())}`,
					originalRoomId: roomId,
					lastActivity: new Date().toISOString(),
					startedAt,
				});
			}

			deactivateTeammate(name);
			changed = true;
		}
	}

	let huddleChanged = false;
	try {
		const currentState = fs.readFileSync(HUDDLE_STATE_FILE, "utf-8");
		if (currentState !== lastHuddleState) {
			huddleChanged = true;
			lastHuddleState = currentState;
		}
	} catch {
		if (lastHuddleState !== "") {
			huddleChanged = true;
			lastHuddleState = "";
		}
	}

	if (changed || huddleChanged) {
		emitEvent({ type: "huddle_update" });
	}
}
