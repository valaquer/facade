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

async function discoverSocket(): Promise<string | null> {
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

		const text = [
			`sender: ${payload.sender}`,
			`room: ${payload.room}`,
			`timestamp: ${payload.timestamp}`,
			`body: "${payload.body}"`,
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

let lastKnownTeammates: string[] = [];

export async function getActiveTeammatesFromKitty(): Promise<string[]> {
	const socket = await discoverSocket();
	if (!socket) return lastKnownTeammates;

	try {
		const { stdout } = await execFileAsync(KITTEN, ["@", "--to", socket, "ls"], { timeout: 30000 });
		const data = JSON.parse(stdout);
		const teammates: string[] = [];

		for (const osWin of data) {
			for (const tab of osWin.tabs ?? []) {
				for (const window of tab.windows ?? []) {
					const val = window.user_vars?.teammate ?? "";
					if (val && !teammates.includes(val)) {
						teammates.push(val);
					}
				}
			}
		}

		lastKnownTeammates = teammates;
		return teammates;
	} catch {
		return lastKnownTeammates;
	}
}
