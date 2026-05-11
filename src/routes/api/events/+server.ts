import type { RequestHandler } from "./$types";
import { onEvent } from "$lib/server/events";

export const GET: RequestHandler = async ({ request }) => {
	const stream = new ReadableStream({
		start(controller) {
			const encoder = new TextEncoder();

			const unsubscribe = onEvent((event) => {
				controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
			});

			controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "connected" })}\n\n`));

			request.signal.addEventListener("abort", () => {
				unsubscribe();
				try {
					controller.close();
				} catch {
					// already closed
				}
			});
		},
	});

	return new Response(stream, {
		headers: {
			"Content-Type": "text/event-stream",
			"Cache-Control": "no-cache",
			Connection: "keep-alive",
		},
	});
};
