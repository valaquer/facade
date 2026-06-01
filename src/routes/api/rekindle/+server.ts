import type { RequestHandler } from "./$types";
import { getRoomsByType, getHuddleMembers } from "$lib/server/facade-db";
import { isTabAlive, sendToKitty } from "$lib/server/kitten";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

const LAUNCH_SCRIPT = "/Users/d.patnaik/honeybloom/chica/scripts/kitty-open-teammate.sh";

function parseDisplayName(roomId: string): string {
	const match = roomId.match(/^(?:direct|huddle)-(.+?)-\d{8}-\d{6}$/);
	if (match) return match[1];
	return roomId.replace(/^direct-/, "").replace(/^huddle-/, "");
}

export const POST: RequestHandler = async () => {
	const teammateRooms = getRoomsByType("teammate");
	const rekindled: string[] = [];
	const skipped: string[] = [];

	for (const room of teammateRooms) {
		const name = parseDisplayName(room.id);
		const alive = await isTabAlive(name);
		if (alive) {
			skipped.push(name);
			continue;
		}

		// Launch Kitty tab via --solo (no pair/trio group launch)
		try {
			await execFileAsync(LAUNCH_SCRIPT, ["--solo", name], {
				timeout: 30000,
			});
			rekindled.push(name);
		} catch (err) {
			console.error(
				`[rekindle] Failed to launch ${name}:`,
				err instanceof Error ? err.message : String(err)
			);
		}
	}

	// After all tabs launched, send huddle context to rekindled teammates
	const activeHuddles = getRoomsByType("huddle");
	for (const name of rekindled) {
		for (const huddle of activeHuddles) {
			const members = getHuddleMembers(huddle.id);
			if (!members.includes(name)) continue;
			// Send huddle room ID so teammate can catch up
			const ts = new Date().toISOString();
			await sendToKitty(name, {
				sender: "boss",
				room: `direct-${name}`,
				body: `You were in huddle ${huddle.id}. Catch up using read_this_huddle with roomId: ${huddle.id}`,
				timestamp: ts,
			});
		}
	}

	return new Response(JSON.stringify({ rekindled, skipped }), {
		headers: { "Content-Type": "application/json" },
	});
};

// GET — returns zombie count for client-side copper flash
export const GET: RequestHandler = async () => {
	const teammateRooms = getRoomsByType("teammate");
	let zombieCount = 0;

	for (const room of teammateRooms) {
		const name = parseDisplayName(room.id);
		const alive = await isTabAlive(name);
		if (!alive) zombieCount++;
	}

	return new Response(JSON.stringify({ zombieCount }), {
		headers: { "Content-Type": "application/json" },
	});
};
