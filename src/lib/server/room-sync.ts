import { getActiveTeammatesFromKitty } from "./kitten";
import { getActiveTeammates, activateTeammate, deactivateTeammate } from "./active-teammates";
import { emitEvent } from "./events";
import { saveRoom, resolveActiveRoom, setRoomType, formatTimestamp } from "./facade-db";
import { endOrphanHuddles } from "./huddle-helpers";

const POLL_INTERVAL = 3000;

let intervalHandle: ReturnType<typeof setInterval> | null = null;

export async function startRoomSync(): Promise<void> {
	if (intervalHandle) return;
	await syncOnce();
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
		const baseRoomId = `direct-${name}`;
		if (!resolveActiveRoom(baseRoomId)) {
			const ts = formatTimestamp(new Date());
			saveRoom({
				id: `direct-${name}-${ts}`,
				type: "teammate",
				name,
				originalRoomId: baseRoomId,
				lastActivity: new Date().toISOString(),
				startedAt: new Date().toISOString(),
			});
			changed = true;
		}
		if (!prevActive.includes(name)) {
			activateTeammate(name);
			changed = true;
		}
	}

	for (const name of prevActive) {
		if (!kittyTeammates.includes(name)) {
			const roomId = resolveActiveRoom(`direct-${name}`);
			if (roomId) setRoomType(roomId, "past");

			deactivateTeammate(name);
			changed = true;
		}
	}

	endOrphanHuddles(kittyTeammates);

	if (changed) {
		emitEvent({ type: "huddle_update" });
	}
}
