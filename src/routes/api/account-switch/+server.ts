import type { RequestHandler } from "./$types";
import { getAliveTeammates, closeKittyTab } from "$lib/server/kitten";
import { getRoomsByType } from "$lib/server/facade-db";
import { endHuddle } from "$lib/server/huddle-helpers";
import { execFile, execSync } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

const SSH_KEY = "/Users/d.patnaik/.ssh/id_hanover";
const MINI_USER = "deepak-macmini";
const MINI_HOST = "192.168.0.186";

// GET — auto-detect active account from claude auth status
export const GET: RequestHandler = async () => {
	let account = "unknown";
	try {
		const raw = execSync(
			"env -u CLAUDE_CODE_OAUTH_TOKEN /Users/d.patnaik/.local/bin/claude auth status 2>&1",
			{
				timeout: 5000,
				encoding: "utf-8",
			}
		);
		const parsed = JSON.parse(raw);
		const email = (parsed.email ?? "").toLowerCase();
		if (email.includes("oovar")) account = "oovar";
		else if (email.includes("gmail")) account = "gmail";
	} catch {}
	return new Response(JSON.stringify({ account }), {
		headers: { "Content-Type": "application/json" },
	});
};

// POST — kill all Kitty tabs (iMac + Mini), preserve Facade rooms
export const POST: RequestHandler = async () => {
	// Step 1: Kill all Kitty tabs on iMac (without archiving rooms)
	const alive = await getAliveTeammates();
	const killPromises: Promise<boolean>[] = [];
	for (const name of alive) {
		killPromises.push(closeKittyTab(name));
	}
	await Promise.all(killPromises);

	// Step 2: Kill claude processes on Mini via SSH
	try {
		await execFileAsync(
			"ssh",
			[
				"-i",
				SSH_KEY,
				"-o",
				"ConnectTimeout=5",
				"-o",
				"StrictHostKeyChecking=no",
				`${MINI_USER}@${MINI_HOST}`,
				"pkill -f claude; pkill -f opencode; true",
			],
			{ timeout: 10000 }
		);
	} catch {
		// Mini may be off or have no processes — not fatal
	}

	// Step 3: Archive all active huddles
	const huddles = getRoomsByType("huddle");
	for (const huddle of huddles) {
		try {
			endHuddle(huddle.id);
		} catch {
			// Per-huddle try-catch — one failure doesn't block the rest
		}
	}

	return new Response(JSON.stringify({ killed: [...alive] }), {
		headers: { "Content-Type": "application/json" },
	});
};
