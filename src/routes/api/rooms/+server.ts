import type { RequestHandler } from "./$types";
import { getRoomsByType, getAllRooms, getHuddleMembers } from "$lib/server/facade-db";
import fs from "fs";

const CSV_PATH =
	"/Users/d.patnaik/honeybloom/library/skills/gestalt-layer-3-janus/janus-config.csv";

function parseDisplayName(roomId: string): string {
	const match = roomId.match(/^(?:direct|huddle)-([a-z]+)/);
	if (match) return match[1];
	const legacy = roomId.replace(/^direct-/, "").replace(/^huddle-/, "");
	return legacy.replace(/-legacy$/, "");
}

function loadModelMap(): Record<string, string> {
	try {
		const raw = fs.readFileSync(CSV_PATH, "utf-8");
		const lines = raw.trim().split("\n");
		const modelMap: Record<string, string> = {};
		for (let i = 1; i < lines.length; i++) {
			const cols = lines[i].split(",");
			if (cols.length >= 3) {
				modelMap[cols[0].trim().toLowerCase()] = cols[2].trim();
			}
		}
		return modelMap;
	} catch {
		return {};
	}
}

export const GET: RequestHandler = async () => {
	const modelMap = loadModelMap();
	const teammateRooms = getAllRooms().filter((r) => r.type === "teammate");
	const teammates = teammateRooms.map((r) => {
		const name = parseDisplayName(r.id);
		return {
			id: r.id,
			name,
			teammate: name,
			model: modelMap[name] || "",
			lastActivity: r.lastActivity,
		};
	});

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
