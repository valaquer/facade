import type { RequestHandler } from "./$types";
import { getRoomsByType, getAllRooms, getHuddleMembers } from "$lib/server/facade-db";

function parseDisplayName(roomId: string): string {
	const match = roomId.match(/^(?:direct|huddle)-(.+?)-\d{8}-\d{6}$/);
	if (match) return match[1];
	const legacy = roomId.replace(/^direct-/, "").replace(/^huddle-/, "");
	return legacy.replace(/-legacy$/, "");
}

export const GET: RequestHandler = async () => {
	const teammateRooms = getAllRooms().filter((r) => r.type === "teammate");
	const teammates = teammateRooms.map((r) => ({
		id: r.id,
		name: parseDisplayName(r.id),
		teammate: parseDisplayName(r.id),
		lastActivity: r.lastActivity,
	}));

	const huddleRooms = getAllRooms().filter((r) => r.type === "huddle");
	const huddles = huddleRooms.map((r) => ({
		id: r.id,
		name: parseDisplayName(r.id),
		host: r.name,
		participants: getHuddleMembers(r.id),
		startedAt: r.startedAt,
	}));

	const pastRooms = getRoomsByType("past").map((r) => ({
		id: r.id,
		name: r.id,
		type: "past" as const,
		startedAt: r.startedAt,
	}));

	return new Response(JSON.stringify({ teammates, huddles, pastRooms }), {
		headers: { "Content-Type": "application/json" },
	});
};
