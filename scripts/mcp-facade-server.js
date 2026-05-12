#!/usr/bin/env node
// Facade MCP Server — stdio-based MCP server for teammates.
// Exposes: post_to_facade(body: string)
// Called via MCP from Kitty teammate tabs.

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";

const FACADE_URL = process.env.FACADE_URL || "http://localhost:51730";
const SENDER = process.env.FACADE_SENDER || "unknown";
const ROOM = process.env.FACADE_ROOM || "direct-boss";

const server = new Server(
	{ name: "Facade MCP", version: "0.1.0" },
	{ capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
	tools: [
		{
			name: "post_to_facade",
			description: "Post a message to your Facade room from your Kitty tab",
			inputSchema: {
				type: "object",
				properties: {
					body: { type: "string", description: "The message content" },
				},
				required: ["body"],
			},
		},
	],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
	if (request.params.name !== "post_to_facade") {
		throw new Error(`Unknown tool: ${request.params.name}`);
	}

	const body = String(request.params.arguments?.body ?? "");
	if (!body) {
		return { content: [{ type: "text", text: "Error: body is required" }] };
	}

	try {
		const res = await fetch(`${FACADE_URL}/api/message`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ sender: SENDER, body, room: ROOM }),
		});

		if (!res.ok) {
			return { content: [{ type: "text", text: `Error: Facade returned ${res.status}` }] };
		}

		return { content: [{ type: "text", text: "Message sent to Boss in Facade." }] };
	} catch (err) {
		return {
			content: [
				{ type: "text", text: `Error: ${err instanceof Error ? err.message : String(err)}` },
			],
		};
	}
});

const transport = new StdioServerTransport();
server.connect(transport);
