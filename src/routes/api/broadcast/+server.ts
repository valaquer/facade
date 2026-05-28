import type { RequestHandler } from "./$types";
import { getHuddleMembers } from "$lib/server/facade-db";
import { sendToKitty } from "$lib/server/kitten";

export const POST: RequestHandler = async ({ request }) => {
	const { sender, room, content } = await request.json();

	if (!sender || !room || !content) {
		return new Response(JSON.stringify({ error: "Missing sender, room, or content" }), {
			status: 400,
			headers: { "Content-Type": "application/json" },
		});
	}

	// Only fan out in huddle rooms
	if (!room.startsWith("huddle-")) {
		return new Response(JSON.stringify({ delivered: 0 }), {
			headers: { "Content-Type": "application/json" },
		});
	}

	const members = getHuddleMembers(room);
	let delivered = 0;

	for (const m of members) {
		if (m === sender) continue;
		try {
			await sendToKitty(m, {
				sender,
				room,
				body: content,
				timestamp: new Date().toISOString(),
			});
			delivered++;
		} catch {}
	}

	return new Response(JSON.stringify({ delivered }), {
		headers: { "Content-Type": "application/json" },
	});
};
