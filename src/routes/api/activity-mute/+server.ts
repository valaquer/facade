import type { RequestHandler } from "./$types";
import { readFileSync } from "fs";

const ACTIVITY_MUTE_FILE = "/Users/d.patnaik/honeybloom/library/facade/activity-mute.md";

export const GET: RequestHandler = async () => {
	try {
		const lines = readFileSync(ACTIVITY_MUTE_FILE, "utf-8")
			.split("\n")
			.map((l) => l.trim().toLowerCase())
			.filter((l) => l.length > 0 && l.includes(":"));
		const entries = lines.map((line) => {
			const [sender, room] = line.split(":", 2);
			return { sender, room };
		});
		return new Response(JSON.stringify(entries), {
			headers: { "Content-Type": "application/json" },
		});
	} catch {
		return new Response(JSON.stringify([]), {
			headers: { "Content-Type": "application/json" },
		});
	}
};
