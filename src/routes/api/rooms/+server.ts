import type { RequestHandler } from "./$types";
import { getActiveTeammates } from "$lib/server/active-teammates";

export const GET: RequestHandler = async () => {
	const active = getActiveTeammates();

	const teammates = active.map((name) => ({
		id: `direct-${name}`,
		name: name.charAt(0).toUpperCase() + name.slice(1),
		teammate: name,
		lastActivity: new Date().toISOString(),
	}));

	return new Response(JSON.stringify({ teammates, huddles: [] }), {
		headers: { "Content-Type": "application/json" },
	});
};
