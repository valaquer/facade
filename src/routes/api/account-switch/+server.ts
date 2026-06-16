import type { RequestHandler } from "./$types";
import { readFileSync, writeFileSync } from "fs";
import { getAliveTeammates, closeKittyTab } from "$lib/server/kitten";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

const FLAG_FILE = "/Users/d.patnaik/honeybloom/library/facade/active-account";
const SSH_KEY = "/Users/d.patnaik/.ssh/id_hanover";
const MINI_USER = "deepak-macmini";
const MINI_HOST = "192.168.0.186";

function readActiveAccount(): string {
	try {
		return readFileSync(FLAG_FILE, "utf-8").trim();
	} catch {
		return "gmail";
	}
}

// GET — returns current active account
export const GET: RequestHandler = async () => {
	return new Response(JSON.stringify({ account: readActiveAccount() }), {
		headers: { "Content-Type": "application/json" },
	});
};

// POST — kill all tabs, flip account, return new account
export const POST: RequestHandler = async () => {
	const current = readActiveAccount();
	const next = current === "oovar" ? "gmail" : "oovar";

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

	// Step 3: Flip the flag file
	writeFileSync(FLAG_FILE, next);

	return new Response(JSON.stringify({ account: next, killed: [...alive] }), {
		headers: { "Content-Type": "application/json" },
	});
};
