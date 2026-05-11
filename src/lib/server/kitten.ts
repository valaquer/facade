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

export async function getActiveTeammatesFromKitty(): Promise<string[]> {
	const socket = await discoverSocket();
	if (!socket) return [];

	try {
		const { stdout } = await execFileAsync(KITTEN, ["@", "--to", socket, "ls"], { timeout: 5000 });
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
