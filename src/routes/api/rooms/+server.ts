import type { RequestHandler } from "./$types";
import { getRoomsByType, getAllRooms, saveRoom, roomExists } from "$lib/server/facade-db";
import fs from "fs";

const HUDDLE_STATE_FILE = "/tmp/kitty-huddles.json";

interface HuddleEntry {
	host: string;
	participants: string[];
	started: string;
}

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

	const huddles: {
		id: string;
		name: string;
		host: string;
		participants: string[];
		startedAt: string;
	}[] = [];
	try {
		const raw = fs.readFileSync(HUDDLE_STATE_FILE, "utf-8");
		const state: Record<string, HuddleEntry> = JSON.parse(raw);
		const activeHuddleIds = new Set<string>();

		for (const [hostKey, entry] of Object.entries(state)) {
			const id = `huddle-${hostKey}`;
			activeHuddleIds.add(id);
			huddles.push({
				id,
				name: hostKey,
				host: entry.host,
				participants: entry.participants,
				startedAt: entry.started,
			});

			if (!roomExists(id)) {
				saveRoom({
					id,
					type: "huddle",
					name: hostKey,
					participants: entry.participants,
					lastActivity: new Date().toISOString(),
					startedAt: entry.started,
				});
			}
		}

		// Move previously-known huddles that are no longer active to past rooms
		const knownHuddles = getRoomsByType("huddle");
		for (const known of knownHuddles) {
			if (!activeHuddleIds.has(known.id)) {
				saveRoom({
					id: known.id,
					type: "past",
					name: known.name,
					participants: JSON.parse(known.participants),
					lastActivity: known.lastActivity,
					startedAt: known.startedAt,
				});
			}
		}
	} catch {
		// state file missing or invalid — no active huddles
	}

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
