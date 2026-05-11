import { getActiveTeammatesFromKitty } from "./kitten";
import { getActiveTeammates, activateTeammate, deactivateTeammate } from "./active-teammates";
import { emitEvent } from "./events";

const POLL_INTERVAL = 10000;

let intervalHandle: ReturnType<typeof setInterval> | null = null;

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
			deactivateTeammate(name);
			changed = true;
		}
	}

	if (changed) {
		emitEvent({ type: "huddle_update" });
	}
}
