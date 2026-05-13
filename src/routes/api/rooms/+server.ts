import type { RequestHandler } from "./$types";
import { getActiveTeammates } from "$lib/server/active-teammates";
import fs from "fs";

const HUDDLE_STATE_FILE = "/tmp/kitty-huddles.json";

interface HuddleEntry {
	host: string;
	participants: string[];
	started: string;
}

export const GET: RequestHandler = async () => {
	const active = getActiveTeammates();

	const teammates = active.map((name) => ({
		id: `direct-${name}`,
		name: name.charAt(0).toUpperCase() + name.slice(1),
		teammate: name,
		lastActivity: new Date().toISOString(),
	}));

	let huddles: { id: string; name: string; host: string; participants: string[] }[] = [];
	try {
		const raw = fs.readFileSync(HUDDLE_STATE_FILE, "utf-8");
		const state: Record<string, HuddleEntry> = JSON.parse(raw);
		huddles = Object.entries(state).map(([hostKey, entry]) => ({
			id: `huddle-${hostKey}`,
			name: hostKey,
			host: entry.host,
			participants: entry.participants,
		}));
	} catch {
		// state file missing or invalid — no active huddles
	}

	return new Response(JSON.stringify({ teammates, huddles }), {
		headers: { "Content-Type": "application/json" },
	});
};
