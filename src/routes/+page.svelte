<script lang="ts">
	import { marked } from 'marked';
	import { onMount, onDestroy } from 'svelte';

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
		const { toolName, toolInput, toolOutput, status } = data;
		const statusIcon = status === "success" ? "✓" : "✗";
		const statusColor = status === "success" ? "#4ade80" : "#f87171";
		let inputHtml = "";
		let outputHtml = "";
		if (toolInput) {
			const input = typeof toolInput === "string" ? toolInput : JSON.stringify(toolInput, null, 2);
			inputHtml = `<div style="font-size: 11px; margin-bottom: 0.25rem; color: var(--color-text-muted);">Input:</div><pre style="background: var(--color-bg); padding: 0.5em; border-radius: 4px; white-space: pre-wrap; overflow-wrap: break-word; font-size: 11px; line-height: 1.5; margin: 0 0 0.75em 0;"><code>${escapeHtml(input)}</code></pre>`;
		}
		if (toolOutput) {
			const output = typeof toolOutput === "string" ? toolOutput : JSON.stringify(toolOutput, null, 2);
			outputHtml = `<div style="font-size: 11px; margin-bottom: 0.25rem; color: var(--color-text-muted);">Output:</div><pre style="background: var(--color-bg); padding: 0.5em; border-radius: 4px; white-space: pre-wrap; overflow-wrap: break-word; font-size: 11px; line-height: 1.5; margin: 0;"><code>${escapeHtml(output)}</code></pre>`;
		}
		return `<div style="background: var(--color-bg-panel); border-radius: 4px; padding: 0.75em; margin-bottom: 0.5em;">
			<div style="display: flex; align-items: center; gap: 0.5em; margin-bottom: 0.5em; padding-bottom: 0.5em; border-bottom: 1px solid var(--color-bg-step4);">
				<span style="font-family: var(--font-mono); font-size: 11px; font-weight: 500; color: ${statusColor};">${statusIcon}</span>
				<span style="font-family: var(--font-mono); font-size: 11px; font-weight: 500; color: var(--color-text);">${escapeHtml(toolName)}</span>
			</div>
			${inputHtml}
			${outputHtml}
		</div>`;
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

	type SidebarItem = { id: string; name: string; kind: "teammate" | "huddle" | "past"; participants?: string[] };
	type ChatMsg = { id: string; sender: string; content: string; createdAt: string; toolCall?: boolean };
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
	let scrollState = $state<'live' | 'paused'>('live');
	let messageQueue = $state<ChatMsg[]>([]);
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

	let prefsTimer: ReturnType<typeof setTimeout> | undefined;

	async function loadSidebar() {
		try {
			const res = await fetch("/api/rooms");
			const data = await res.json();
			const teammates = (data.teammates ?? []).map((t: { id: string; name: string }) => ({ id: t.id, name: t.name, kind: "teammate" as const }));
			const currentHuddles: SidebarItem[] = (data.huddles ?? []).map((h: { id: string; name: string; host: string; participants: string[] }) => ({ id: h.id, name: h.name, kind: "huddle" as const, participants: h.participants }));
			const pastItems: SidebarItem[] = (data.pastRooms ?? []).map((p: { id: string; name: string }) => ({ id: p.id, name: p.name, kind: "past" as const }));

			const items = [...teammates, ...currentHuddles, ...pastItems];
			sidebarItems = items;
			if (selectedIndex >= items.length + bookmarks.length) selectedIndex = 0;

			const prefsRes = await fetch("/api/preferences");
			const prefs = await prefsRes.json();
			if (prefs.selectedRoom) {
				const idx = items.findIndex((i) => i.id === prefs.selectedRoom);
				if (idx >= 0) {
					const pastStart = items.findIndex(x => x.kind === "past");
					selectedIndex = (pastStart >= 0 && idx >= pastStart) ? idx + bookmarks.length : idx;
				}
			}
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
		if (messageQueue.length > 0) {
			const convId = selectedConvId;
			if (convId) {
				conversations[convId] = [...(conversations[convId] ?? []), ...messageQueue];
				conversations = conversations;
			}
			messageQueue = [];
		}
		scrollState = 'live';
	}

	function stepOne() {
		if (messageQueue.length === 0) return;
		const msg = messageQueue[0];
		messageQueue = messageQueue.slice(1);
		const convId = selectedConvId;
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
			} else if (data.type === "huddle_update") {
				loadSidebar();
			} else if (data.type === "message") {
				const convId = data.conversationId;
				const msg: ChatMsg = {
					id: data.id ?? `${convId}-${Date.now()}`,
					sender: data.sender,
					content: data.content,
					createdAt: data.timestamp ?? new Date().toISOString(),
					toolCall: data.toolCall === true,
				};
				if (scrollState === 'paused' && convId === selectedConvId) {
					messageQueue = [...messageQueue, msg];
				} else {
					conversations[convId] = [...(conversations[convId] ?? []), msg];
					conversations = conversations;
				}
			}
		} catch {
			// ignore parse errors
		}
	}

	function connectEventSource() {
		eventSource?.close();
		eventSource = new EventSource("/api/events");
		eventSource.onmessage = handleSSE;
	}

	function reconnect() {
		connectEventSource();
		loadSidebar();
		fetch("/api/livemirror-status").then(r => r.json()).then(d => { liveMirrorActive = d.active; }).catch(() => {});
		// Reload current room messages
		const convId = selectedConvId;
		if (convId) {
			fetch(`/api/messages?room=${convId}`)
				.then((r) => r.json())
				.then((msgs: any[]) => {
					conversations[convId] = msgs.map((m) => ({ ...m, toolCall: m.type === "tool_call" }));
					conversations = conversations;
				})
				.catch(() => {});
		}
	}

	function handleVisibilityChange() {
		if (document.visibilityState === 'visible') {
			reconnect();
		}
	}

	onMount(() => {
		loadSidebar();
		loadBookmarks();
		fetch("/api/livemirror-status").then(r => r.json()).then(d => { liveMirrorActive = d.active; }).catch(() => {});
		connectEventSource();
		document.addEventListener('visibilitychange', handleVisibilityChange);
	});

	onDestroy(() => {
		eventSource?.close();
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
	$effect(() => {
		const room = selectedConvId;
		if (room && room !== prevRoom) {
			prevRoom = room;
			savePrefs();
			flushQueue();
		}
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

	$effect(() => {
		currentMessages;
		if (messagesContainer && scrollState === 'live') {
			messagesContainer.scrollTop = messagesContainer.scrollHeight;
		}
	});

	$effect(() => {
		const convId = selectedConvId;
		if (convId && !conversations[convId]) {
			fetch(`/api/messages?room=${convId}`)
				.then((r) => r.json())
				.then((msgs: any[]) => {
					conversations[convId] = msgs.map((m) => ({ ...m, toolCall: m.type === "tool_call" }));
					conversations = conversations;
				})
				.catch(() => {});
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

<div class="h-full flex">
	<!-- Sidebar -->
	<div style="width: 280px; flex-shrink: 0; background: var(--color-bg-panel); border-right: 1px dashed var(--color-bg-step4); display: flex; flex-direction: column; height: 100vh;">
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
						{fmt.label} &nbsp;{#if fmt.date}<span style="font-size: 9px; color: #666;">{fmt.date}</span>{/if}
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
						<div style="font-size: 9px; line-height: 1.6; color: #666;">{item.participants.join(', ')}</div>
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

	<!-- Main content -->
	<div class="flex-1 flex flex-col" style="height: 100vh; position: relative;">
	{#if selectedConvId}
		<!-- Conversation area (scrollable) -->
		<div class="flex-1 overflow-y-auto" style="background: var(--color-bg); padding-bottom: 120px;" bind:this={messagesContainer}>
			<div class="py-2" style="max-width: 570px; display: grid; grid-template-columns: 72px minmax(0, 1fr); gap: 0 12px; margin-left: calc((100vw - 570px) / 2 - 280px); margin-right: auto; margin-top: auto;">
				{#each currentMessages as msg}
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
						>🔖</button>
					</div>
				{/each}
			</div>
		</div>
		<!-- Input bar -->
		<div style="position: absolute; bottom: 0; left: 0; right: 0; background: var(--color-bg);">
		<!-- Control strip -->
		<div style="max-width: 570px; margin-left: calc((100vw - 570px) / 2 - 280px); margin-right: auto; display: grid; grid-template-columns: 72px minmax(0, 1fr); gap: 0 12px;">
			<div></div>
			<div class="control-strip">
				<span class="control-led" style="margin-right: 4px;" class:active={liveMirrorActive} title="Live mirror"></span>
				<button class="control-btn" onclick={() => { if (scrollState === 'live') { scrollState = 'paused'; } else { stepOne(); } }} title={scrollState === 'live' ? "Pause" : messageQueue.length > 0 ? "Next message" : "Paused"}>
					{#if scrollState === 'paused'}
						<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#7a5e4a" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="6 3 20 12 6 21 6 3"></polygon></svg>
						{#if messageQueue.length > 0}<span class="queue-badge">{messageQueue.length}</span>{/if}
					{:else}
						<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#555" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="14" y="4" width="4" height="16" rx="1"></rect><rect x="6" y="4" width="4" height="16" rx="1"></rect></svg>
					{/if}
				</button>
				<button class="control-btn" onclick={() => flushQueue()} title="Stop — catch up to latest">
					<svg width="14" height="14" viewBox="0 0 24 24" fill={scrollState === 'paused' ? '#7a5e4a' : '#555'} stroke="none"><rect x="3" y="3" width="18" height="18" rx="2"></rect></svg>
				</button>
			</div>
		</div>
		<div style="max-width: 570px; display: grid; grid-template-columns: 72px minmax(0, 1fr); gap: 0 12px; margin-left: calc((100vw - 570px) / 2 - 280px); margin-right: auto;">
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
	{:else}
		<div class="flex-1 flex items-center justify-center" style="background: var(--color-bg);">
			<p style="color: var(--color-text-muted); font-size: 12px;">Select a teammate</p>
		</div>
	{/if}
	</div>
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
		top: 2rem;
		right: 0;
		background: none;
		border: none;
		cursor: pointer;
		font-size: 12px;
		color: var(--color-text-muted);
		opacity: 0;
		transition: opacity 0.15s;
		padding: 2px 4px;
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
