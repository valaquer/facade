import { execFile } from "child_process";
import { promisify } from "util";
import { readdirSync, existsSync } from "fs";

const execFileAsync = promisify(execFile);

const KITTEN = "/opt/homebrew/bin/kitten";

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

export async function sendToKitty(
	teammate: string,
	payload: { sender: string; room: string; body: string; timestamp: string }
): Promise<string> {
	const socket = await discoverSocket();
	if (!socket) return "no_socket";

	const text = [
		`sender: ${payload.sender}`,
		`room: ${payload.room}`,
		`timestamp: ${payload.timestamp}`,
		`body: "${payload.body}"`,
	].join("\n");

	try {
		const execFileAsyncBound = execFileAsync;
		await execFileAsyncBound(
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
			{ timeout: 30000 }
		);

		await new Promise((resolve) => setTimeout(resolve, 1000));

		await execFileAsyncBound(
			KITTEN,
			["@", "--to", socket, "send-key", "--match", `var:teammate=${teammate}`, "enter"],
			{ timeout: 3000 }
		);

		return "delivered";
	} catch (err) {
		return `error: ${err instanceof Error ? err.message : String(err)}`;
	}
}

export async function getActiveTeammatesFromKitty(): Promise<string[]> {
	const socket = await discoverSocket();
	if (!socket) return [];

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

		return teammates;
	} catch {
		return [];
	}
}
