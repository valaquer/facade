import { execFile } from "child_process";
import { promisify } from "util";
import { readdirSync, existsSync } from "fs";

const execFileAsync = promisify(execFile);

const KITTEN = "/opt/homebrew/bin/kitten";

// Per-teammate send queue: serializes sendToKitty calls so two payloads
// never interleave in the same PTY input buffer (REQ-98)
const sendQueues = new Map<string, Promise<void>>();

function enqueue(teammate: string, fn: () => Promise<void>): Promise<void> {
	const prev = sendQueues.get(teammate) ?? Promise.resolve();
	const next = prev.then(fn, fn);
	sendQueues.set(teammate, next);
	return next;
}

export async function discoverSocket(): Promise<string | null> {
	const envSocket = process.env.KITTY_LISTEN_ON;

	if (envSocket) {
		const sockPath = envSocket.replace("unix:", "");
		if (existsSync(sockPath)) {
			try {
				await execFileAsync(KITTEN, ["@", "--to", envSocket, "ls"], { timeout: 3000 });
				return envSocket;
			} catch {
				// continue to glob
			}
		}
	}

	const tmpFiles = readdirSync("/tmp");
	const socketFiles = tmpFiles.filter(
		(f) => f.startsWith("honeybloom-kitty-") && f.endsWith(".sock")
	);
	for (const f of socketFiles) {
		const sockPath = `/tmp/${f}`;
		const socketUri = `unix:${sockPath}`;
		try {
			await execFileAsync(KITTEN, ["@", "--to", socketUri, "ls"], { timeout: 3000 });
			return socketUri;
		} catch {
			continue;
		}
	}

	return null;
}

export function sendToKitty(
	teammate: string,
	payload: { sender: string; room: string; body: string; timestamp: string }
): Promise<string> {
	let result = "queued";
	const work = enqueue(teammate, async () => {
		const socket = await discoverSocket();
		if (!socket) {
			result = "no_socket";
			return;
		}

		let replyRoom = payload.room;
		if (payload.room.startsWith("direct-") && payload.sender !== "boss") {
			replyRoom = `direct-${payload.sender.toLowerCase()}`;
		} else if (payload.room.startsWith("direct-")) {
			// Strip session-scoped timestamps from Boss Reply-to (prevents model ID fabrication)
			const bareMatch = payload.room.match(/^(direct-[a-z]+)/);
			replyRoom = bareMatch ? bareMatch[1] : payload.room;
		}
		const text = [
			`sender: ${payload.sender}`,
			`room: ${payload.room}`,
			`timestamp: ${payload.timestamp}`,
			`body: "${payload.body}"`,
			`---\nReply to: ${replyRoom}`,
		].join("\n");

		try {
			const len = text.length;
			const sendTimeout = Math.min(Math.max(5000, len * 2), 30000);
			const enterDelay = Math.min(Math.max(1000, len * 0.5), 10000);
			const t0 = Date.now();

			await execFileAsync(
				KITTEN,
				[
					"@",
					"--to",
					socket,
					"send-text",
					"--match",
					`var:teammate=${teammate}`,
					"--bracketed-paste",
					"disable",
					text,
				],
				{ timeout: sendTimeout }
			);

			const sendDuration = Date.now() - t0;
			console.log(
				`[sendToKitty] to=${teammate} len=${len} timeout=${sendTimeout}ms delay=${enterDelay}ms sendDuration=${sendDuration}ms`
			);

			await new Promise((resolve) => setTimeout(resolve, enterDelay));

			await execFileAsync(
				KITTEN,
				["@", "--to", socket, "send-key", "--match", `var:teammate=${teammate}`, "enter"],
				{ timeout: 3000 }
			);

			result = "delivered";
		} catch (err) {
			result = `error: ${err instanceof Error ? err.message : String(err)}`;
		}
	});
	return work.then(() => result);
}

export async function getAliveTeammates(): Promise<Set<string>> {
	const socket = await discoverSocket();
	if (!socket) return new Set();
	try {
		const { stdout } = await execFileAsync(KITTEN, ["@", "--to", socket, "ls"], { timeout: 5000 });
		const data = JSON.parse(stdout);
		const alive = new Set<string>();
		if (Array.isArray(data)) {
			for (const osWindow of data) {
				for (const tab of osWindow.tabs ?? []) {
					const teammateVar = Object.entries(tab.windows?.[0]?.user_vars ?? {}).find(
						([k]) => k === "teammate"
					);
					if (teammateVar) alive.add((teammateVar[1] as string).toLowerCase());
				}
			}
		}
		return alive;
	} catch {
		return new Set();
	}
}

export async function isTabAlive(teammate: string): Promise<boolean> {
	const socket = await discoverSocket();
	if (!socket) return false;
	try {
		const { stdout } = await execFileAsync(
			KITTEN,
			["@", "--to", socket, "ls", "--match", `var:teammate=${teammate}`],
			{ timeout: 3000 }
		);
		const data = JSON.parse(stdout);
		return Array.isArray(data) && data.length > 0;
	} catch {
		return false;
	}
}

export async function closeKittyTab(teammate: string): Promise<boolean> {
	const socket = await discoverSocket();
	if (!socket) return false;
	try {
		await execFileAsync(
			KITTEN,
			["@", "--to", socket, "close-tab", "--match", `var:teammate=${teammate}`],
			{ timeout: 3000 }
		);
		return true;
	} catch {
		return false;
	}
}
