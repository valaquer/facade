import type { RequestHandler } from "./$types";
import { resolveActiveRoom, setRoomType } from "$lib/server/facade-db";
import { deactivateTeammate } from "$lib/server/active-teammates";
import { emitEvent } from "$lib/server/events";
import { isTabAlive, closeKittyTab } from "$lib/server/kitten";

export const POST: RequestHandler = async ({ request }) => {
	const { name } = await request.json();
	if (!name) {
		return new Response(JSON.stringify({ error: "Missing name" }), { status: 400 });
	}

	const teammate = name.toLowerCase();

	// If the Kitty tab is still alive, close it first (REQ-138)
	const tabAlive = await isTabAlive(teammate);
	if (tabAlive) {
		await closeKittyTab(teammate);
	}

	// Move direct room to Past Rooms (huddles are independent — archived separately)
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
