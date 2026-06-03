<script lang="ts">
	import { marked } from 'marked';
	import { onMount, onDestroy } from 'svelte';
	import LucideBookmark from '~icons/lucide/bookmark';
	import LucidePlay from '~icons/lucide/play';
	import LucidePause from '~icons/lucide/pause';
	import LucideSquare from '~icons/lucide/square';
	import LucideX from '~icons/lucide/x';
	import LucideRadio from '~icons/lucide/radio';
	import LucideMessageSquareOff from '~icons/lucide/message-square-off';
	import LucideVolumeX from '~icons/lucide/volume-x';
	import LucideZap from '~icons/lucide/zap';

	marked.setOptions({ breaks: true, gfm: true });

	function renderMd(content: string): string {
		const lines = content.split('\n');
		const processed: string[] = [];
		for (let i = 0; i < lines.length; i++) {
			const isListItem = /^\d+\.\s/.test(lines[i]);
			const prevIsListItem = i > 0 && /^\d+\.\s/.test(lines[i - 1]);
			const prevIsBlank = i > 0 && lines[i - 1].trim() === '';
			if (isListItem && !prevIsListItem && !prevIsBlank && i > 0) {
				processed.push('');
			}
			if (!isListItem && prevIsListItem && lines[i].trim() !== '') {
				processed.push('');
			}
			processed.push(lines[i]);
		}
		return marked.parse(processed.join('\n')) as string;
	}

	function renderToolCard(content: string): string {
		let data: any;
		try { data = JSON.parse(content); } catch { return renderMd(content); }
		const { toolName, toolInput, toolOutput, status, summary } = data;
		const statusIcon = status === "error" ? "✗" : status === "success" ? "✓" : "";
		const statusColor = status === "error" ? "#f87171" : status === "success" ? "#4ade80" : "transparent";
		const headerStyle = "display: flex; align-items: center; gap: 0.5em; margin-bottom: 0.5em; padding-bottom: 0.5em; border-bottom: 1px solid var(--color-bg-step4);";
		const cardStyle = "background: var(--color-bg-panel); border-radius: 4px; padding: 0.75em; margin-bottom: 0.5em;";
		const preStyle = "background: var(--color-bg); padding: 0.5em; border-radius: 4px; white-space: pre-wrap; overflow-wrap: break-word; font-size: 11px; line-height: 1.5; margin: 0;";
		const labelStyle = "font-size: 11px; margin-bottom: 0.25rem; color: var(--color-text-muted);";
		const nameStyle = "font-family: var(--font-mono); font-size: 11px; font-weight: 500;";

		if (summary) {
			return `<div style="background: var(--color-bg-panel); border-radius: 4px; padding: 0.5em 0.75em;">
				<div style="display: flex; align-items: center; gap: 0.5em;">
					<span style="${nameStyle} color: ${statusColor};">${statusIcon}</span>
					<span style="${nameStyle} color: var(--color-text);">${escapeHtml(toolName)}</span>
				</div>
				<div style="font-family: var(--font-mono); font-size: 11px; color: var(--color-text-muted); margin-top: 0.25em;">${escapeHtml(summary)}</div>
			</div>`;
		}

		const input = typeof toolInput === "string" ? tryParseJson(toolInput) : toolInput;
		const tool = (toolName || "").toLowerCase();

		// Edit tool — show file path header + diff-style old/new
		if (tool === "edit") {
			const filePath = input?.file_path || input?.filePath || "";
			const oldStr = input?.old_string || "";
			const newStr = input?.new_string || "";
			const fileName = filePath.split("/").slice(-2).join("/");
			let diffHtml = "";
			if (oldStr || newStr) {
				const oldLines = oldStr.split("\n").map((l: string) => `<div style="background: rgba(180,60,60,0.12); color: #c9877a; padding: 0 0.5em;">- ${escapeHtml(l)}</div>`).join("");
				const newLines = newStr.split("\n").map((l: string) => `<div style="background: rgba(60,140,80,0.12); color: #8abf8a; padding: 0 0.5em;">+ ${escapeHtml(l)}</div>`).join("");
				diffHtml = `<div style="font-family: var(--font-mono); font-size: 11px; line-height: 1.5; border-radius: 4px; overflow: hidden; background: var(--color-bg); margin-top: 0.5em;">${oldLines}${newLines}</div>`;
			}
			return `<div style="${cardStyle}">
				<div style="${headerStyle}">
					<span style="${nameStyle} color: ${statusColor};">${statusIcon}</span>
					<span style="${nameStyle} color: var(--color-text);">Edit</span>
					<span style="font-family: var(--font-mono); font-size: 11px; color: var(--color-text-muted);">${escapeHtml(fileName)}</span>
				</div>
				${diffHtml}
			</div>`;
		}

		// Write tool — show file path header + content preview
		if (tool === "write") {
			const filePath = input?.file_path || input?.filePath || "";
			const fileContent = input?.content || "";
			const fileName = filePath.split("/").slice(-2).join("/");
			const preview = fileContent.length > 500 ? fileContent.substring(0, 500) + "\n... [truncated]" : fileContent;
			return `<div style="${cardStyle}">
				<div style="${headerStyle}">
					<span style="${nameStyle} color: ${statusColor};">${statusIcon}</span>
					<span style="${nameStyle} color: var(--color-text);">Write</span>
					<span style="font-family: var(--font-mono); font-size: 11px; color: var(--color-text-muted);">${escapeHtml(fileName)}</span>
				</div>
				<pre style="${preStyle}"><code>${escapeHtml(preview)}</code></pre>
			</div>`;
		}

		// Bash tool — show command header + output (with diff coloring if detected)
		if (tool === "bash") {
			const command = input?.command || "";
			const description = input?.description || "";
			const output = typeof toolOutput === "string" ? toolOutput : JSON.stringify(toolOutput, null, 2);
			const descHtml = description ? `<div style="font-family: var(--font-mono); font-size: 11px; color: var(--color-text-muted); margin-bottom: 0.5em;">${escapeHtml(description)}</div>` : "";
			return `<div style="${cardStyle}">
				<div style="${headerStyle}">
					<span style="${nameStyle} color: ${statusColor};">${statusIcon}</span>
					<span style="${nameStyle} color: var(--color-text);">Bash</span>
				</div>
				${descHtml}
				<pre style="${preStyle} margin-bottom: 0.5em; background: rgba(200,180,140,0.12); color: #c8b896;"><code>$ ${escapeHtml(command)}</code></pre>
				${output ? renderBashOutput(output) : ""}
			</div>`;
		}

		// Default — render structured fields as key: value lines, not raw JSON
		let inputHtml = "";
		let outputHtml = "";
		if (toolInput) {
			const parsed = typeof toolInput === "string" ? tryParseJson(toolInput) : toolInput;
			if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
				const lines = Object.entries(parsed)
					.filter(([, v]) => v !== null && v !== undefined && v !== "")
					.map(([k, v]) => {
						const val = typeof v === "string" ? v : JSON.stringify(v);
						const truncated = val.length > 300 ? val.substring(0, 300) + " ..." : val;
						return `<div style="margin-bottom: 0.25em;"><span style="color: var(--color-text-muted);">${escapeHtml(k)}:</span> ${escapeHtml(truncated)}</div>`;
					}).join("");
				inputHtml = `<div style="font-family: var(--font-mono); font-size: 11px; line-height: 1.5; margin-bottom: 0.5em;">${lines}</div>`;
			} else {
				const inputStr = typeof toolInput === "string" ? toolInput : JSON.stringify(toolInput, null, 2);
				inputHtml = `<div style="${labelStyle}">Input:</div><pre style="${preStyle} margin-bottom: 0.75em;"><code>${escapeHtml(inputStr)}</code></pre>`;
			}
		}
		if (toolOutput) {
			const output = typeof toolOutput === "string" ? toolOutput : JSON.stringify(toolOutput, null, 2);
			const truncated = output.length > 1000 ? output.substring(0, 1000) + "\n... [truncated]" : output;
			outputHtml = `<div style="${labelStyle}">Output:</div><pre style="${preStyle}"><code>${escapeHtml(truncated)}</code></pre>`;
		}
		return `<div style="${cardStyle}">
			<div style="${headerStyle}">
				<span style="${nameStyle} color: ${statusColor};">${statusIcon}</span>
				<span style="${nameStyle} color: var(--color-text);">${escapeHtml(toolName)}</span>
			</div>
			${inputHtml}
			${outputHtml}
		</div>`;
	}

	function renderBashOutput(output: string): string {
		const lines = output.split("\n");
		const isDiff = lines.some(l => l.startsWith("diff --git ") || l.startsWith("@@"));
		if (!isDiff) {
			return `<pre style="background: var(--color-bg); padding: 0.5em; border-radius: 4px; white-space: pre-wrap; overflow-wrap: break-word; font-size: 11px; line-height: 1.5; margin: 0;"><code>${escapeHtml(output)}</code></pre>`;
		}
		const colored = lines.map(line => {
			const escaped = escapeHtml(line);
			if (line.startsWith("diff --git ") || line.startsWith("--- ") || line.startsWith("+++ ")) {
				return `<div style="color: var(--color-text-muted); padding: 0 0.5em;">${escaped}</div>`;
			}
			if (line.startsWith("@@")) {
				return `<div style="color: var(--color-text-muted); padding: 0 0.5em;">${escaped}</div>`;
			}
			if (line.startsWith("+")) {
				return `<div style="background: rgba(60,140,80,0.12); color: #8abf8a; padding: 0 0.5em;">${escaped}</div>`;
			}
			if (line.startsWith("-")) {
				return `<div style="background: rgba(180,60,60,0.12); color: #c9877a; padding: 0 0.5em;">${escaped}</div>`;
			}
			return `<div style="padding: 0 0.5em;">${escaped}</div>`;
		}).join("");
		return `<div style="font-family: var(--font-mono); font-size: 11px; line-height: 1.5; border-radius: 4px; overflow: hidden; background: var(--color-bg);">${colored}</div>`;
	}

	function tryParseJson(str: string): any {
		try { return JSON.parse(str); } catch { return str; }
	}

	function escapeHtml(str: string): string {
		return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
	}

	onMount(() => {
		document.addEventListener('click', (e) => {
			const btn = (e.target as HTMLElement).closest('.copy-btn');
			if (!btn) return;
			const pre = btn.closest('pre');
			if (!pre) return;
			const code = pre.querySelector('code');
			if (!code) return;
			navigator.clipboard.writeText(code.textContent || '');
			btn.textContent = 'Copied';
			setTimeout(() => { btn.textContent = 'Copy'; }, 1500);
		});

		const observer = new MutationObserver(() => {
			document.querySelectorAll('.md-content pre').forEach((pre) => {
				if (pre.querySelector('.copy-btn')) return;
				const btn = document.createElement('button');
				btn.className = 'copy-btn';
				btn.textContent = 'Copy';
				pre.appendChild(btn);
			});
		});
		observer.observe(document.body, { childList: true, subtree: true });
		document.querySelectorAll('.md-content pre').forEach((pre) => {
			if (pre.querySelector('.copy-btn')) return;
			const btn = document.createElement('button');
			btn.className = 'copy-btn';
			btn.textContent = 'Copy';
			pre.appendChild(btn);
		});
	});

	type SidebarItem = { id: string; name: string; kind: "teammate" | "huddle" | "past"; model?: string; participants?: string[] };
	type ChatMsg = { id: string; sender: string; content: string; createdAt: string; toolCall?: boolean; response?: boolean; summary?: string };
	type Bookmark = { id: string; messageId: string; roomId: string; name: string; createdAt: string };

	function formatPastRoom(name: string): { label: string; date: string } {
		const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
		// direct-{name}-{YYYYMMDD}-{HHMMSS}
		const directMatch = name.match(/^direct-(.+)-(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})\d{2}$/);
		if (directMatch) {
			const [, n, y, mo, d, h, mi] = directMatch;
			return { label: n, date: `${parseInt(d)} ${months[parseInt(mo)-1]} ${y} ${h}:${mi}` };
		}
		// huddle-{host}-{YYYYMMDD}-{HHMMSS}
		const huddleMatch = name.match(/^huddle-(.+)-(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})\d{2}$/);
		if (huddleMatch) {
			const [, host, y, mo, d, h, mi] = huddleMatch;
			return { label: host + "'s huddle", date: `${parseInt(d)} ${months[parseInt(mo)-1]} ${y} ${h}:${mi}` };
		}
		return { label: name, date: "" };
	}

	let sidebarItems = $state<SidebarItem[]>([]);
	let selectedIndex = $state(0);
	let conversations = $state<Record<string, ChatMsg[]>>({});
	let newMessage = $state("");
	let eventSource: EventSource | undefined;
	let messagesContainer: HTMLElement | undefined = $state();
	let liveMirrorActive = $state(false);
	let mutedEntries = $state<{sender: string, room: string}[]>([]);
	let pausedRoom = $state<string | null>(null);
	let queuedMessageIds = $state<string[]>([]);
	let messageQueues = $state<Record<string, ChatMsg[]>>({});
	let userScrolledUp = $state(false);
	let loadingRoom = $state("");
	let pausing = $state(false);
	let pauseError = $state(false);
	let broadcastedMsgId = $state<string | null>(null);
	let rekindling = $state(false);
	let rekindleFlash = $state(false);
	let zombieCount = $state(0);
	async function fetchZombieCount() {
		try {
			const r = await fetch("/api/rekindle");
			if (r.ok) { const d = await r.json(); zombieCount = d.zombieCount ?? 0; }
		} catch {}
	}
	function isMutedInRoom(participant: string, roomId: string): boolean {
		const p = participant.toLowerCase();
		const r = roomId.toLowerCase();
		return mutedEntries.some(e => p === e.sender && r.startsWith(e.room));
	}
	// Nav index math: visual order is teammates → huddles → bookmarks → past rooms
	// sidebarItems order is teammates → huddles → past rooms
	// preBookmarkCount = index where past rooms start in sidebarItems
	let preBookmarkCount = $derived.by(() => {
		const idx = sidebarItems.findIndex(x => x.kind === "past");
		return idx === -1 ? sidebarItems.length : idx;
	});
	let totalNavItems = $derived(sidebarItems.length + bookmarks.length);
	// Nav index → data: [0..pbc-1] = sidebarItems[0..pbc-1], [pbc..pbc+B-1] = bookmarks, [pbc+B..end] = sidebarItems[pbc..end]
	let selectedConvId = $derived.by(() => {
		const pbc = preBookmarkCount;
		if (selectedIndex < pbc) {
			return sidebarItems[selectedIndex]?.id ?? "";
		}
		if (selectedIndex < pbc + bookmarks.length) {
			return bookmarks[selectedIndex - pbc]?.roomId ?? "";
		}
		const sidebarIdx = selectedIndex - bookmarks.length;
		return sidebarItems[sidebarIdx]?.id ?? "";
	});

	let currentRoomKind = $derived.by(() => {
		const pbc = preBookmarkCount;
		if (selectedIndex < pbc) {
			return sidebarItems[selectedIndex]?.kind ?? "";
		}
		if (selectedIndex < pbc + bookmarks.length) {
			const bm = bookmarks[selectedIndex - pbc];
			const item = sidebarItems.find(x => x.id === bm?.roomId);
			return item?.kind ?? "past";
		}
		const sidebarIdx = selectedIndex - bookmarks.length;
		return sidebarItems[sidebarIdx]?.kind ?? "";
	});

	let prefsTimer: ReturnType<typeof setTimeout> | undefined;

	async function loadSidebar() {
		try {
			const [roomsRes, prefsRes] = await Promise.all([
				fetch("/api/rooms"),
				fetch("/api/preferences"),
			]);
			const data = await roomsRes.json();
			const prefs = await prefsRes.json();
			const teammates = (data.teammates ?? []).map((t: { id: string; name: string; model: string }) => ({ id: t.id, name: t.name, model: t.model || "", kind: "teammate" as const })).sort((a, b) => a.name.localeCompare(b.name));
			const currentHuddles: SidebarItem[] = (data.huddles ?? []).map((h: { id: string; name: string; host: string; participants: string[] }) => ({ id: h.id, name: h.name, kind: "huddle" as const, participants: h.participants }));
			const pastItems: SidebarItem[] = (data.pastRooms ?? []).map((p: { id: string; name: string }) => ({ id: p.id, name: p.name, kind: "past" as const }));

			const items = [...teammates, ...currentHuddles, ...pastItems];
			let newIndex = selectedIndex;
			if (newIndex >= items.length + bookmarks.length) newIndex = 0;
			if (prefs.selectedRoom) {
				const idx = items.findIndex((i) => i.id === prefs.selectedRoom);
				if (idx >= 0) {
					const pastStart = items.findIndex(x => x.kind === "past");
					newIndex = (pastStart >= 0 && idx >= pastStart) ? idx + bookmarks.length : idx;
				}
			}
			sidebarItems = items;
			selectedIndex = newIndex;
		} catch {
			sidebarItems = [];
		}
	}

	function savePrefs() {
		if (prefsTimer) clearTimeout(prefsTimer);
		prefsTimer = setTimeout(() => {
			const roomId = selectedConvId;
			if (roomId) {
				fetch("/api/preferences", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ selectedRoom: roomId }),
				}).catch(() => {});
			}
		}, 300);
	}

	function flushQueue() {
		const convId = selectedConvId;
		const queue = convId ? (messageQueues[convId] ?? []) : [];
		if (queue.length > 0 && convId) {
			conversations[convId] = [...(conversations[convId] ?? []), ...queue];
			conversations = conversations;
			messageQueues[convId] = [];
			messageQueues = messageQueues;
		}
		pausedRoom = null;
		userScrolledUp = false;
		queuedMessageIds = [];
		localStorage.removeItem('facade-queued-ids');
		localStorage.removeItem('facade-paused-room');
	}

	async function rekindleZombies() {
		if (rekindling) return;
		rekindling = true;
		try {
			const res = await fetch("/api/rekindle", { method: "POST" });
			if (!res.ok) throw new Error();
			const data = await res.json();
			if (data.rekindled.length > 0) {
				rekindleFlash = true;
				setTimeout(() => rekindleFlash = false, 1500);
			}
			await fetchZombieCount();
		} catch {
			// silent fail
		} finally {
			rekindling = false;
		}
	}

	async function sendPauseMessage() {
		if (pausing) return;
		pausing = true;
		try {
			const res = await fetch("/api/message", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ sender: "boss", room: selectedConvId, body: "Everybody, pause." }),
			});
			if (!res.ok) throw new Error();
		} catch {
			pauseError = true;
			setTimeout(() => pauseError = false, 2000);
		} finally {
			pausing = false;
		}
	}

	function stepOne() {
		const convId = selectedConvId;
		const queue = convId ? (messageQueues[convId] ?? []) : [];
		if (queue.length === 0) { pausedRoom = null; queuedMessageIds = []; localStorage.removeItem('facade-queued-ids'); localStorage.removeItem('facade-paused-room'); return; }
		const msg = queue[0];
		messageQueues[convId!] = queue.slice(1);
		messageQueues = messageQueues;
		if (convId) {
			conversations[convId] = [...(conversations[convId] ?? []), msg];
			conversations = conversations;
			setTimeout(() => {
				if (messagesContainer) {
					const el = messagesContainer.querySelector(`[data-msg-id="${msg.id}"]`);
					if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
				}
			}, 50);
		}
		if ((messageQueues[convId!] ?? []).length === 0) {
			pausedRoom = null;
			queuedMessageIds = [];
			localStorage.removeItem('facade-queued-ids');
			localStorage.removeItem('facade-paused-room');
		}
	}

	async function sendMessage() {
		const content = newMessage.trim();
		if (!content || !selectedConvId) return;
		newMessage = "";
		flushQueue();

		try {
			const res = await fetch("/api/message", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ sender: "boss", body: content, room: selectedConvId }),
			});

		} catch {
			// ignore send errors
		}
	}

	function handleSSE(event: MessageEvent) {
		try {
			const data = JSON.parse(event.data);
			if (data.type === "livemirror_status") {
				liveMirrorActive = data.active;
			} else if (data.type === "mute_update") {
				fetch(`/api/activity-mute?t=${Date.now()}`).then(r => r.json()).then(d => { mutedEntries = d; }).catch(() => {});
			} else if (data.type === "zombie_update") {
				zombieCount = data.zombieCount ?? 0;
			} else if (data.type === "huddle_update") {
				loadSidebar();
				fetchZombieCount();
			} else if (data.type === "message") {
				const convId = data.conversationId;
				const msg: ChatMsg = {
					id: data.id ?? `${convId}-${Date.now()}`,
					sender: data.sender,
					content: data.content,
					createdAt: data.timestamp ?? new Date().toISOString(),
					toolCall: data.toolCall === true,
					response: data.response === true,
					summary: data.summary || "",
				};
				if (convId === pausedRoom || (convId === selectedConvId && loadingRoom)) {
					messageQueues[convId] = [...(messageQueues[convId] ?? []), msg];
					messageQueues = messageQueues;
					queuedMessageIds = [...queuedMessageIds, msg.id];
					localStorage.setItem('facade-queued-ids', JSON.stringify(queuedMessageIds));
				} else {
					conversations[convId] = [...(conversations[convId] ?? []), msg];
					conversations = conversations;
				}
			}
		} catch {
			// ignore parse errors
		}
	}

	let sseTimeout: ReturnType<typeof setTimeout> | undefined;

	function connectEventSource() {
		eventSource?.close();
		if (sseTimeout) clearTimeout(sseTimeout);
		eventSource = new EventSource("/api/events");
		eventSource.onmessage = handleSSE;
		sseTimeout = setTimeout(() => {
			if (eventSource?.readyState !== EventSource.OPEN) {
				eventSource?.close();
				eventSource = new EventSource("/api/events");
				eventSource.onmessage = handleSSE;
				sseTimeout = setTimeout(() => {
					if (eventSource?.readyState !== EventSource.OPEN) {
						loadingRoom = "";
					}
				}, 5000);
				eventSource.onopen = () => { if (sseTimeout) clearTimeout(sseTimeout); };
			}
		}, 5000);
		eventSource.onopen = () => { if (sseTimeout) clearTimeout(sseTimeout); };
	}

	let isReconnecting = false;

	function reconnect() {
		if (isReconnecting) return;
		isReconnecting = true;
		connectEventSource();
		Promise.all([
			loadSidebar(),
			fetch("/api/livemirror-status").then(r => r.json()).then(d => { liveMirrorActive = d.active; }).catch(() => {}),
			fetch("/api/activity-mute").then(r => r.json()).then(d => { mutedEntries = d; }).catch(() => {}),
			fetchZombieCount(),
		]).then(() => {
			// Force room-switch $effect to re-run and load messages
			prevRoom = "";
		}).finally(() => {
			isReconnecting = false;
		});
	}

	function handleVisibilityChange() {
		if (document.visibilityState === 'visible') {
			reconnect();
		}
	}

	onMount(() => {
		pausedRoom = localStorage.getItem('facade-paused-room');
		const savedIds = localStorage.getItem('facade-queued-ids');
		if (savedIds) { try { queuedMessageIds = JSON.parse(savedIds); } catch {} }
		loadSidebar();
		loadBookmarks();
		fetch("/api/livemirror-status").then(r => r.json()).then(d => { liveMirrorActive = d.active; }).catch(() => {});
		fetch("/api/activity-mute").then(r => r.json()).then(d => { mutedEntries = d; }).catch(() => {});
		fetchZombieCount();
		connectEventSource();
		document.addEventListener('visibilitychange', handleVisibilityChange);
	});

	onDestroy(() => {
		eventSource?.close();
		if (sseTimeout) clearTimeout(sseTimeout);
		if (typeof document !== 'undefined') {
			document.removeEventListener('visibilitychange', handleVisibilityChange);
		}
	});

	let inputRef: HTMLTextAreaElement | undefined = $state();


	$effect(() => {
		const idx = selectedIndex;
		const el = document.querySelector(`[data-nav-idx="${idx}"]`);
		if (el) el.scrollIntoView({ block: "nearest" });
	});

	let prevRoom = "";

	// Consolidated room-switch effect: saves prefs, resets per-room state, fetches messages.
	// Replaces the old competing $effects on savePrefs, auto-scroll, and fetchMessages.
	$effect(() => {
		const room = selectedConvId;
		if (!room || room === prevRoom) return;
		prevRoom = room;
		savePrefs();
		userScrolledUp = false;
		loadingRoom = room;
		fetch(`/api/messages?room=${room}`)
			.then((r) => r.json())
			.then((msgs: any[]) => {
				if (loadingRoom !== room) return;
				const parsed = msgs.map((m) => ({ ...m, toolCall: m.type === "tool_call", response: m.type === "response" }));
				// If paused and have queued IDs, split: queued go to messageQueues, rest to conversations
				if (pausedRoom === room && queuedMessageIds.length > 0) {
					const queued = parsed.filter((m: ChatMsg) => queuedMessageIds.includes(m.id));
					const rest = parsed.filter((m: ChatMsg) => !queuedMessageIds.includes(m.id));
					conversations[room] = rest;
					conversations = conversations;
					messageQueues[room] = queued;
					messageQueues = messageQueues;
				} else {
					conversations[room] = parsed;
					conversations = conversations;
				}
				loadingRoom = "";
				// Scroll to bottom on initial load — skip if room is paused
				setTimeout(() => {
					if (pausedRoom !== room) {
						if (messagesContainer) messagesContainer.scrollTop = messagesContainer.scrollHeight;
						if (activityContainer) activityContainer.scrollTop = activityContainer.scrollHeight;
					}
				}, 50);
			})
			.catch(() => { if (loadingRoom === room) loadingRoom = ""; });
	});

	function handleKeydown(e: KeyboardEvent) {
		if (e.ctrlKey && e.key === 'ArrowDown') {
			e.preventDefault();
			if (totalNavItems === 0) return;
			selectedIndex = (selectedIndex + 1) % totalNavItems;
			const pbc = preBookmarkCount;
			if (selectedIndex >= pbc && selectedIndex < pbc + bookmarks.length) {
				pendingScrollMessageId = bookmarks[selectedIndex - pbc]?.messageId ?? null;
			}
		} else if (e.ctrlKey && e.key === 'ArrowUp') {
			e.preventDefault();
			if (totalNavItems === 0) return;
			selectedIndex = (selectedIndex - 1 + totalNavItems) % totalNavItems;
			const pbc = preBookmarkCount;
			if (selectedIndex >= pbc && selectedIndex < pbc + bookmarks.length) {
				pendingScrollMessageId = bookmarks[selectedIndex - pbc]?.messageId ?? null;
			}
		} else if (e.key === 'Enter' && !e.shiftKey && document.activeElement !== inputRef) {
			e.preventDefault();
			inputRef?.focus();
		} else if (e.key === 'Escape' && document.activeElement === inputRef) {
			e.preventDefault();
			inputRef?.blur();
		}
	}

	function isTokenNoise(msg: ChatMsg): boolean {
		if (msg.sender !== "system") return false;
		const c = msg.content;
		return c.startsWith("Token passed to ") || c.includes("token released");
	}

	let currentMessages = $derived(selectedConvId ? (conversations[selectedConvId] ?? []).filter((m) => !isTokenNoise(m)) : []);
	let chatMessages = $derived(currentMessages.filter((m) => !m.toolCall && !m.response));
	let activityCards = $derived(currentMessages.filter((m) => m.toolCall || m.response));

	$effect(() => {
		chatMessages;
		if (messagesContainer && pausedRoom !== selectedConvId && !userScrolledUp) {
			messagesContainer.scrollTop = messagesContainer.scrollHeight;
		}
	});

	let activityContainer: HTMLElement | undefined = $state();

	$effect(() => {
		activityCards;
		if (activityContainer && pausedRoom !== selectedConvId) {
			activityContainer.scrollTop = activityContainer.scrollHeight;
		}
	});

	function autofocusInput(node: HTMLInputElement) {
		setTimeout(() => node.focus(), 0);
	}

	// Bookmarks
	let bookmarks = $state<Bookmark[]>([]);
	let editingBookmarkId = $state<string | null>(null);
	let editingBookmarkName = $state("");
	let pendingScrollMessageId = $state<string | null>(null);

	async function loadBookmarks() {
		try {
			const res = await fetch("/api/bookmarks");
			bookmarks = await res.json();
		} catch { bookmarks = []; }
	}

	async function toggleBookmark(msg: ChatMsg) {
		const existing = bookmarks.find(bm => bm.messageId === msg.id);
		if (existing) {
			await fetch("/api/bookmarks", {
				method: "DELETE",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ id: existing.id }),
			});
			bookmarks = bookmarks.filter(bm => bm.id !== existing.id);
		} else {
			const fallbackTime = new Date(msg.createdAt);
			const hh = String(fallbackTime.getHours()).padStart(2, "0");
			const mm = String(fallbackTime.getMinutes()).padStart(2, "0");
			const fallbackName = `${msg.sender} \u00b7 ${hh}:${mm}`;
			const res = await fetch("/api/bookmarks", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ messageId: msg.id, roomId: selectedConvId, name: fallbackName }),
			});
			if (res.ok) {
				const bm: Bookmark = await res.json();
				bookmarks = [bm, ...bookmarks];
				editingBookmarkId = bm.id;
				editingBookmarkName = "";
			}
		}
	}

	function commitBookmarkName(bm: Bookmark) {
		const trimmed = editingBookmarkName.trim();
		if (trimmed) {
			bm.name = trimmed;
			fetch("/api/bookmarks", {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ id: bm.id, name: bm.name }),
			}).catch(() => {});
		}
		editingBookmarkId = null;
		editingBookmarkName = "";
		bookmarks = [...bookmarks];
	}

	function navigateToBookmark(bm: Bookmark) {
		const idx = sidebarItems.findIndex((item) => item.id === bm.roomId);
		if (idx >= 0) {
			selectedIndex = idx;
			pendingScrollMessageId = bm.messageId;
		}
	}

	function scrollToMessage(messageId: string) {
		if (!messagesContainer) return;
		const el = messagesContainer.querySelector(`[data-msg-id="${messageId}"]`);
		if (el) {
			el.scrollIntoView({ behavior: "smooth", block: "center" });
			el.classList.add("bookmark-highlight");
			setTimeout(() => el.classList.remove("bookmark-highlight"), 2000);
			pendingScrollMessageId = null;
		}
	}

	$effect(() => {
		const msgs = currentMessages;
		const target = pendingScrollMessageId;
		if (target && msgs.length > 0) {
			setTimeout(() => scrollToMessage(target), 100);
		}
	});

	async function dismissTeammate(name: string) {
		try {
			await fetch("/api/rooms/deactivate", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ name }),
			});
		} catch {}
	}

	// Ruler overlay
	let showRuler = $state(false);
	let rulerX = $state(100);
	let rulerY = $state(200);
	let dragging = $state(false);
	let dragOffsetX = 0;
	let dragOffsetY = 0;

	function onRulerMouseDown(e: MouseEvent) {
		dragging = true;
		dragOffsetX = e.clientX - rulerX;
		dragOffsetY = e.clientY - rulerY;
		e.preventDefault();
	}

	function onRulerMouseMove(e: MouseEvent) {
		if (!dragging) return;
		rulerX = e.clientX - dragOffsetX;
		rulerY = e.clientY - dragOffsetY;
	}

	function onRulerMouseUp() {
		dragging = false;
	}
</script>

<svelte:window onkeydown={handleKeydown} onmousemove={onRulerMouseMove} onmouseup={onRulerMouseUp} />

<div style="display: grid; grid-template-columns: 280px 1fr 570px 1fr 570px 1fr; height: 100vh;">
	<!-- Sidebar -->
	<div style="background: var(--color-bg-panel); border-right: 1px dashed var(--color-bg-step4); display: flex; flex-direction: column; height: 100vh;">
		<div style="flex: 1; overflow-y: auto; font-family: var(--font-sans);">
			<div style="padding: 1rem 1rem 1rem 1.5rem; border-bottom: 1px dashed var(--color-bg-step4);">
				<p style="display: inline-block; font-size: 13px; font-weight: 500; font-family: var(--font-sans); background: var(--gradient-accent); background-repeat: no-repeat; -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;">Teammates</p>
			</div>
			<div style="padding: 0.5rem 0 60px 0;">
				{#each sidebarItems.filter((x) => x.kind === "teammate") as item}
					{@const fmt = formatPastRoom(item.id)}
					<div
						class="teammate-row"
						data-nav-idx={sidebarItems.indexOf(item)}
						onclick={() => selectedIndex = sidebarItems.indexOf(item)}
						style="padding: 0 1rem 0 1.5rem; cursor: pointer; color: {selectedIndex === sidebarItems.indexOf(item) ? 'var(--color-text)' : 'var(--color-text-muted)'}; background: {selectedIndex === sidebarItems.indexOf(item) ? 'var(--color-bg-element)' : 'transparent'}; position: relative;"
					>
						<div>{fmt.label} {#if fmt.date}<span style="font-size: 9px; color: #666;">{fmt.date}</span>{/if} {#if item.model} <span style="font-size: 9px; color: #666; font-family: Menlo, monospace; font-weight: bold;">{item.model}</span>{/if}</div>
						<button
							class="dismiss-btn"
							onclick={(e) => { e.stopPropagation(); dismissTeammate(fmt.label); }}
							title="Move to Past Rooms"
						>&times;</button>
					</div>
				{/each}
			</div>

			<div style="padding: 1rem 1rem 1rem 1.5rem; border-bottom: 1px dashed var(--color-bg-step4);">
				<p style="display: inline-block; font-size: 13px; font-weight: 500; font-family: var(--font-sans); background: var(--gradient-accent); background-repeat: no-repeat; -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;">Huddles</p>
			</div>
			<div style="padding: 0.5rem 0 60px 0;">
			{#each sidebarItems.filter((x) => x.kind === "huddle") as item}
				{@const fmt = formatPastRoom(item.id)}
				<div
					data-nav-idx={sidebarItems.indexOf(item)}
					onclick={() => selectedIndex = sidebarItems.indexOf(item)}
					style="padding: 0 1rem 0 1.5rem; cursor: pointer; color: {selectedIndex === sidebarItems.indexOf(item) ? 'var(--color-text)' : 'var(--color-text-muted)'}; background: {selectedIndex === sidebarItems.indexOf(item) ? 'var(--color-bg-element)' : 'transparent'};"
				>
					<div>{fmt.label} &nbsp;{#if fmt.date}<span style="font-size: 9px; color: #666;">{fmt.date}</span>{/if}</div>
					{#if item.participants?.length}
						<div style="font-size: 9px; line-height: 1.6; color: #666;">{#each item.participants as p, pi}{#if pi > 0}{', '}{/if}{#if isMutedInRoom(p, item.id)}<LucideVolumeX width={9} height={9} style="color: #7a5e4a; display: inline; vertical-align: baseline;" />&nbsp;<span style="color: #7a5e4a;">{p}</span>{:else}{p}{/if}{/each}</div>
					{/if}
				</div>
			{/each}
			</div>

			{#if bookmarks.length > 0}
				<div style="padding: 1rem 1rem 1rem 1.5rem; border-bottom: 1px dashed var(--color-bg-step4);">
					<p style="display: inline-block; font-size: 13px; font-weight: 500; font-family: var(--font-sans); background: var(--gradient-accent); background-repeat: no-repeat; -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;">Bookmarks</p>
				</div>
				<div style="padding: 0.5rem 0 60px 0;">
				{#each bookmarks as bm, bmIdx}
					{@const navIdx = preBookmarkCount + bmIdx}
					<div
						data-nav-idx={navIdx}
						onclick={() => { selectedIndex = navIdx; pendingScrollMessageId = bm.messageId; }}
						style="padding: 0 1rem 0 1.5rem; cursor: pointer; color: {selectedIndex === navIdx ? 'var(--color-text)' : 'var(--color-text-muted)'}; background: {selectedIndex === navIdx ? 'var(--color-bg-element)' : 'transparent'};"
					>
						{#if editingBookmarkId === bm.id}
							<input
								type="text"
								bind:value={editingBookmarkName}
								placeholder="Type bookmark name"
								onkeydown={(e) => { if (e.key === 'Enter' || e.key === 'Escape') { e.preventDefault(); commitBookmarkName(bm); } }}
								onblur={() => commitBookmarkName(bm)}
								style="background: transparent; border: none; outline: none; color: var(--color-text); font-family: var(--font-sans); font-size: inherit; width: 100%; padding: 0;"
								use:autofocusInput
							/>
						{:else}
							<div>{bm.name}</div>
						{/if}
					</div>
				{/each}
				</div>
			{/if}

			{#if sidebarItems.filter((x) => x.kind === "past").length > 0}
				<div style="padding: 1rem 1rem 1rem 1.5rem; border-bottom: 1px dashed var(--color-bg-step4);">
					<p style="display: inline-block; font-size: 13px; font-weight: 500; font-family: var(--font-sans); background: var(--gradient-accent); background-repeat: no-repeat; -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;">Past Rooms</p>
				</div>
				<div style="padding: 0.5rem 0 60px 0;">
				{#each sidebarItems.filter((x) => x.kind === "past") as item}
					{@const fmt = formatPastRoom(item.name)}
					{@const pastNavIdx = sidebarItems.indexOf(item) + bookmarks.length}
					<div
						data-nav-idx={pastNavIdx}
						onclick={() => selectedIndex = pastNavIdx}
					style="padding: 0 1rem 0 1.5rem; cursor: pointer; color: {selectedIndex === pastNavIdx ? 'var(--color-text)' : 'var(--color-text-muted)'}; background: {selectedIndex === pastNavIdx ? 'var(--color-bg-element)' : 'transparent'};"
					>
						<div>{fmt.label} &nbsp;{#if fmt.date}<span style="font-size: 9px; color: #666;">{fmt.date}</span>{/if}</div>
					</div>
				{/each}
				</div>
			{/if}
		</div>
		<div onclick={() => window.open('/markwhen-fork.html', '_blank')} style="padding: 0.75rem 1rem; border-top: 1px dashed var(--color-bg-step4); cursor: pointer; font-size: 11px; color: var(--color-text-muted);">
			Fire up Markwhen
		</div>
	</div>

	<!-- Gap col 2 -->
	<div></div>
	{#if selectedConvId}
		<!-- Chat column (col 3 — 570px) -->
		<div style="position: relative; overflow: hidden;" class="flex flex-col">
			<!-- Conversation area (scrollable) -->
			<div class="flex-1 overflow-y-auto" style="background: var(--color-bg); padding-bottom: {currentRoomKind === "past" ? '0' : '120px'};" bind:this={messagesContainer} onscroll={(e) => { const el = e.currentTarget; userScrolledUp = el.scrollTop < el.scrollHeight - el.clientHeight - 50; }}>
				<div class="py-2" style="display: grid; grid-template-columns: 72px minmax(0, 1fr); gap: 0 12px; margin-top: auto;">
					{#each chatMessages as msg}
						<div style="padding-top: {msg.toolCall ? 'calc(2rem - 1px + 0.75em)' : 'calc(2rem - 1px)'}; text-align: left; align-self: start;">
							<p style="margin: 0; font-family: var(--font-sans); color: var(--color-text-muted); font-size: 12px; line-height: 1.8;">{msg.sender}</p>
						</div>
						<div class="msg-row" data-msg-id={msg.id} style="padding-top: 2rem; position: relative;">
							<div style="border-left: {msg.sender === 'boss' ? '2px solid #5A3E2E' : '2px solid transparent'}; padding-left: 1.5rem;">
								{#if msg.toolCall}
									{@html renderToolCard(msg.content)}
								{:else}
									<div class="md-content">
										{@html renderMd(msg.content)}
									</div>
								{/if}
							</div>
							<button
								class="bookmark-btn"
								onclick={() => toggleBookmark(msg)}
								title="Bookmark this message"
							><LucideBookmark width={14} height={14} style="color: {bookmarks.some(bm => bm.messageId === msg.id) ? '#7a5e4a' : '#555'}; fill: {bookmarks.some(bm => bm.messageId === msg.id) ? '#7a5e4a' : '#555'};" /></button>
						</div>
					{/each}
				</div>
			</div>
			<!-- Input bar -->
			{#if currentRoomKind !== "past"}
			<div style="position: absolute; bottom: 0; left: 0; right: 0; background: var(--color-bg);">
			<!-- Control strip -->
			<div style="display: grid; grid-template-columns: 72px minmax(0, 1fr); gap: 0 12px;">
				<div></div>
				<div class="control-strip">
					<span class="control-led" style="margin-right: 4px;" class:active={liveMirrorActive} title="Live mirror"></span>
				<button class="control-btn" onclick={() => { if (pausedRoom !== selectedConvId) { pausedRoom = selectedConvId; localStorage.setItem('facade-paused-room', selectedConvId); } else { stepOne(); } }} title={pausedRoom === selectedConvId ? ((messageQueues[selectedConvId]?.length ?? 0) > 0 ? "Next message" : "Paused") : "Pause"}>
					{#if pausedRoom === selectedConvId}
						<LucidePlay width={14} height={14} style="color: #7a5e4a;" />
						{#if (messageQueues[selectedConvId]?.length ?? 0) > 0}<span class="queue-badge">{messageQueues[selectedConvId]!.length}</span>{/if}
					{:else}
						<LucidePause width={14} height={14} style="color: #555;" />
					{/if}
				</button>
				<button class="control-btn" onclick={() => flushQueue()} title="Stop — catch up to latest">
					<LucideSquare width={14} height={14} style="color: {pausedRoom === selectedConvId ? '#7a5e4a' : '#555'}; fill: {pausedRoom === selectedConvId ? '#7a5e4a' : '#555'};" />
					</button>
				<button class="control-btn" onclick={sendPauseMessage} disabled={pausing} title="Pause — alert room">
					<LucideX width={18} height={18} style="color: {pauseError ? '#e74c3c' : '#555'};" />
				</button>
				<button class="control-btn" onclick={rekindleZombies} disabled={rekindling} title="Rekindle — relight all zombie rooms">
					<span class={rekindleFlash || zombieCount > 0 ? 'zap-active' : ''}><LucideZap width={14} height={14} style="color: {rekindleFlash || zombieCount > 0 ? '#7a5e4a' : '#555'};" /></span>
				</button>
				</div>
			</div>
			<div style="display: grid; grid-template-columns: 72px minmax(0, 1fr); gap: 0 12px;">
				<div style="padding-top: calc(0.5rem - 1px); text-align: left; align-self: start;">
					<p style="margin: 0; font-family: var(--font-sans); color: var(--color-text-muted); font-size: 12px; line-height: 1.8;">boss</p>
				</div>
				<div style="padding-top: 0; padding-bottom: 1rem;">
					<form onsubmit={(e) => { e.preventDefault(); sendMessage(); }}>
						<div style="border: 1px dashed var(--color-bg-step4); border-left: 2px solid #5A3E2E;">
							<div style="padding: 0.5rem 1rem 0.5rem 1.5rem; background: var(--color-bg-element);">
								<textarea
									bind:value={newMessage}
									bind:this={inputRef}
									onkeydown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
									class="w-full bg-transparent outline-none resize-none"
									rows="1"
									placeholder="Type a message..."
									style="color: var(--color-text); font-family: var(--font-mono); font-size: 12px; font-weight: 300; border: none; max-height: 200px; field-sizing: content;"
								></textarea>
								<div style="height: 29px;"></div>
							</div>
						</div>
					</form>
				</div>
			</div>
			</div>
			{/if}
		</div>
		<!-- Gap col 4 -->
		<div></div>
		<!-- Duplicate message feed (col 5 — 570px, read-only) -->
		<div bind:this={activityContainer} style="overflow-y: auto; background: var(--color-bg);">
			<div class="py-2" style="padding-top: 0.5rem;">
				<div style="display: grid; grid-template-columns: 72px minmax(0, 1fr); gap: 0 12px;">
					{#each activityCards as msg}
						<div style="padding-top: {msg.toolCall ? 'calc(2rem - 1px + 0.75em)' : 'calc(2rem - 1px)'}; text-align: left; align-self: start;">
							<p style="margin: 0; font-family: var(--font-sans); color: var(--color-text-muted); font-size: 12px; line-height: 1.8;">{msg.sender}</p>
						</div>
						<div class="activity-row" style="padding-top: 2rem; position: relative;">
							<div style="border-left: {msg.sender === 'boss' ? '2px solid #5A3E2E' : '2px solid transparent'}; padding-left: 1.5rem;">
								{#if msg.toolCall}
									{@html renderToolCard(msg.content)}
								{:else}
									<div class="md-content">
										{@html renderMd(msg.content)}
									</div>
								{/if}
							</div>
							{#if msg.response}
							<button
								class="broadcast-btn"
								disabled={broadcastedMsgId === msg.id}
								title="Promote to chat"
								onclick={async () => {
									if (broadcastedMsgId === msg.id) return;
									try {
										await fetch('/api/broadcast', {
											method: 'POST',
											headers: { 'Content-Type': 'application/json' },
											body: JSON.stringify({ sender: msg.sender, room: selectedConvId, content: msg.content }),
										});
										broadcastedMsgId = msg.id;
									} catch {}
								}}
							><LucideRadio width={14} height={14} style="color: {broadcastedMsgId === msg.id ? '#7a5e4a' : '#555'};" /></button>
							{/if}
						</div>
					{/each}
				</div>
			</div>
		</div>
		<!-- Gap col 6 -->
		<div></div>
	{:else}
		<div style="grid-column: 3 / 7; display: flex; align-items: center; justify-content: center; background: var(--color-bg);">
			<p style="color: var(--color-text-muted); font-size: 12px;">Select a teammate</p>
		</div>
	{/if}
</div>

<!-- Ruler toggle button -->
<button
	onclick={() => showRuler = !showRuler}
	style="position: fixed; bottom: 12px; right: 12px; z-index: 10000; width: 28px; height: 28px; border-radius: 4px; border: 1px dashed var(--color-bg-step4); background: var(--color-bg-panel); color: var(--color-text-muted); font-size: 14px; cursor: pointer; display: none; align-items: center; justify-content: center; opacity: 0.6;"
	title="Toggle ruler"
>📏</button>

<!-- Draggable ruler overlay -->
{#if showRuler}
<div
	onmousedown={onRulerMouseDown}
	style="position: fixed; left: {rulerX}px; top: {rulerY}px; z-index: 9999; cursor: {dragging ? 'grabbing' : 'grab'}; user-select: none;"
>
	<img src="/ruler.png" alt="ruler" style="height: 80px; pointer-events: none;" draggable="false" />
</div>
{/if}

<style>
	.zap-active :global(svg) {
		filter: drop-shadow(0 0 3px #7a5e4a);
	}
	.zap-active :global(path) {
		fill: currentColor;
	}
	.teammate-row:hover .dismiss-btn {
		opacity: 1 !important;
	}
	.dismiss-btn {
		position: absolute;
		right: 0.5rem;
		top: 50%;
		transform: translateY(-50%);
		background: none;
		border: none;
		cursor: pointer;
		font-size: 14px;
		color: var(--color-text-muted);
		opacity: 0;
		transition: opacity 0.15s;
		padding: 2px 4px;
		line-height: 1;
	}
	.dismiss-btn:hover {
		color: var(--color-text);
	}
	.msg-row:hover .bookmark-btn {
		opacity: 1 !important;
	}
	.bookmark-btn {
		position: absolute;
		top: calc(2rem - 6px);
		right: 0;
		background: #0b0d10;
		border: none;
		border-radius: 4px;
		cursor: pointer;
		font-size: 12px;
		color: var(--color-text-muted);
		opacity: 0;
		transition: opacity 0.15s;
		padding: 8px;
		display: flex;
		align-items: center;
		justify-content: center;
	}
	.activity-row:hover .broadcast-btn {
		opacity: 1 !important;
	}
	.broadcast-btn {
		position: absolute;
		top: calc(2rem - 6px);
		right: 0;
		background: #0b0d10;
		border: none;
		border-radius: 4px;
		cursor: pointer;
		font-size: 12px;
		color: var(--color-text-muted);
		opacity: 0;
		transition: opacity 0.15s;
		padding: 8px;
		display: flex;
		align-items: center;
		justify-content: center;
	}
	.bookmark-highlight {
		animation: bm-pulse 2s ease-out;
	}
	@keyframes bm-pulse {
		0% { background-color: rgba(90, 62, 46, 0.3); }
		100% { background-color: transparent; }
	}
	.control-strip {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 6px 0 6px 1.5rem;
		background: var(--color-bg);
	}
	.control-btn {
		background: none;
		border: none;
		cursor: pointer;
		font-size: 11px;
		color: var(--color-text-muted);
		padding: 2px 4px;
		opacity: 0.6;
		transition: opacity 0.15s;
		display: flex;
		align-items: center;
		gap: 3px;
	}
	.control-btn:hover {
		opacity: 1;
	}
	.queue-badge {
		font-size: 10px;
		color: #7a5e4a;
		font-family: var(--font-mono);
		margin-left: 2px;
	}
	.control-led {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: #666;
		transition: background 0.3s, box-shadow 0.3s;
	}
	.control-led.active {
		background: #4ade80;
		box-shadow: 0 0 6px #4ade80;
	}
	.livemirror-led {
		position: absolute;
		left: -20px;
		top: calc(2rem + 0.5rem - 1px + 6px);
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: #666;
		transition: background 0.3s, box-shadow 0.3s;
	}
	.livemirror-led.active {
		background: #4ade80;
		box-shadow: 0 0 6px #4ade80;
	}
</style>
