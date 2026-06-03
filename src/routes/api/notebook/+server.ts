import type { RequestHandler } from "./$types";
import { getNotebook, saveNotebook, getHarnessState, setHarnessState } from "$lib/server/facade-db";

export const GET: RequestHandler = async () => {
	const content = getNotebook();
	const notebookOpen = getHarnessState("notebookOpen") === "true";
	return new Response(JSON.stringify({ content, notebookOpen }), {
		headers: { "Content-Type": "application/json" },
	});
};

export const POST: RequestHandler = async ({ request }) => {
	try {
		const body = await request.json();
		if (body.content !== undefined) {
			saveNotebook(body.content);
		}
		if (body.notebookOpen !== undefined) {
			setHarnessState("notebookOpen", String(body.notebookOpen));
		}
		return new Response(JSON.stringify({ ok: true }), {
			headers: { "Content-Type": "application/json" },
		});
	} catch {
		return new Response(JSON.stringify({ error: "Invalid request" }), { status: 400 });
	}
};
