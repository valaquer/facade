import type { RequestHandler } from "./$types";
import {
	resolveActiveRoom,
	setRoomType,
	getHuddleMembers,
	getRoomsByType,
	saveRoom,
} from "$lib/server/facade-db";
import { deactivateTeammate } from "$lib/server/active-teammates";
import { emitEvent } from "$lib/server/events";
import { endHuddle } from "$lib/server/huddle-helpers";
import { clearTokenTimer, advanceTokenAndNotify, startTokenTimer } from "$lib/server/token-helpers";

export const POST: RequestHandler = async ({ request }) => {
	const { name } = await request.json();
	if (!name) {
		return new Response(JSON.stringify({ error: "Missing name" }), { status: 400 });
	}

	const teammate = name.toLowerCase();

	// Huddle cleanup: check if this teammate is in any active huddle
	const activeHuddles = getRoomsByType("huddle");
	for (const huddle of activeHuddles) {
		const members = getHuddleMembers(huddle.id);
		if (!members.includes(teammate)) continue;

		if (huddle.name === teammate) {
			// Teammate is the host — end the huddle
			endHuddle(huddle.id);
		} else {
			// Teammate is a participant — remove them
			const updated = members.filter((m: string) => m !== teammate);
			if (updated.length === 0) {
				setRoomType(huddle.id, "past");
			} else {
				saveRoom({
					id: huddle.id,
					type: "huddle",
					name: huddle.name,
					participants: updated,
					originalRoomId: `huddle-${huddle.name}`,
					lastActivity: new Date().toISOString(),
					startedAt: huddle.startedAt,
				});
				// Release token if removed participant held it
				clearTokenTimer(huddle.id);
				const next = advanceTokenAndNotify(huddle.id, teammate);
				if (next) {
					startTokenTimer(huddle.id);
				}
			}
		}
	}

	// Move direct room to Past Rooms
	const baseRoomId = `direct-${teammate}`;
	const activeRoomId = resolveActiveRoom(baseRoomId);
	if (activeRoomId) {
		setRoomType(activeRoomId, "past");
	}

	deactivateTeammate(teammate);
	emitEvent({ type: "huddle_update" });

	return new Response(JSON.stringify({ status: "deactivated", name: teammate }), {
		headers: { "Content-Type": "application/json" },
	});
};
