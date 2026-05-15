<script lang="ts">
	import { marked } from 'marked';
	import { onMount, onDestroy } from 'svelte';
	import autosize from 'autosize';

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
			inputHtml = `<div style="font-size: 11px; margin-bottom: 0.25rem; color: var(--color-text-muted);">Input:</div><pre style="background: var(--color-bg); padding: 0.5em; border-radius: 4px; overflow-x: auto; font-size: 11px; line-height: 1.5; margin: 0 0 0.75em 0;"><code>${escapeHtml(input)}</code></pre>`;
		}
		if (toolOutput) {
			const output = typeof toolOutput === "string" ? toolOutput : JSON.stringify(toolOutput, null, 2);
			outputHtml = `<div style="font-size: 11px; margin-bottom: 0.25rem; color: var(--color-text-muted);">Output:</div><pre style="background: var(--color-bg); padding: 0.5em; border-radius: 4px; overflow-x: auto; font-size: 11px; line-height: 1.5; margin: 0;"><code>${escapeHtml(output)}</code></pre>`;
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

	let sidebarItems = $state<SidebarItem[]>([]);
	let selectedIndex = $state(0);
	let conversations = $state<Record<string, ChatMsg[]>>({});
	let newMessage = $state("");
	let eventSource: EventSource | undefined;
	let messagesContainer: HTMLElement | undefined = $state();

	let selectedConvId = $derived(sidebarItems[selectedIndex]?.id ?? "");

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
			if (selectedIndex >= items.length) selectedIndex = 0;

			const prefsRes = await fetch("/api/preferences");
			const prefs = await prefsRes.json();
			if (prefs.selectedRoom) {
				const idx = items.findIndex((i) => i.id === prefs.selectedRoom);
				if (idx >= 0) selectedIndex = idx;
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

	function scrollToBottom() {
		if (messagesContainer) {
			messagesContainer.scrollTop = messagesContainer.scrollHeight;
		}
	}

	async function sendMessage() {
		const content = newMessage.trim();
		if (!content || !selectedConvId) return;
		newMessage = "";
		if (inputRef) inputRef.style.height = '';

		try {
			const res = await fetch("/api/message", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ sender: "boss", body: content, room: selectedConvId }),
			});
			if (res.ok) {
				setTimeout(scrollToBottom, 50);
			}
		} catch {
			// ignore send errors
		}
	}

	onMount(() => {
		loadSidebar();
		eventSource = new EventSource("/api/events");
		eventSource.onmessage = (event) => {
			try {
				const data = JSON.parse(event.data);
				if (data.type === "huddle_update") {
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
					conversations[convId] = [...(conversations[convId] ?? []), msg];
					conversations = conversations;
					if (convId === selectedConvId) {
						setTimeout(scrollToBottom, 50);
					}
				}
			} catch {
				// ignore parse errors
			}
		};
	});

	onDestroy(() => {
		eventSource?.close();
	});

	let inputRef: HTMLTextAreaElement | undefined = $state();

	$effect(() => {
		if (inputRef) {
			autosize(inputRef);
			return () => autosize.destroy(inputRef);
		}
	});

	let prevRoom = "";
	$effect(() => {
		const room = selectedConvId;
		if (room && room !== prevRoom) {
			prevRoom = room;
			savePrefs();
		}
	});

	function handleKeydown(e: KeyboardEvent) {
		if (e.ctrlKey && e.key === 'ArrowDown') {
			e.preventDefault();
			if (sidebarItems.length === 0) return;
			selectedIndex = (selectedIndex + 1) % sidebarItems.length;
		} else if (e.ctrlKey && e.key === 'ArrowUp') {
			e.preventDefault();
			if (sidebarItems.length === 0) return;
			selectedIndex = (selectedIndex - 1 + sidebarItems.length) % sidebarItems.length;
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
		const convId = selectedConvId;
		if (convId && !conversations[convId]) {
			fetch(`/api/messages?room=${convId}`)
				.then((r) => r.json())
				.then((msgs: any[]) => {
					conversations[convId] = msgs.map((m) => ({ ...m, toolCall: m.type === "tool_call" }));
					conversations = conversations;
					setTimeout(scrollToBottom, 50);
				})
				.catch(() => {});
		} else if (convId) {
			setTimeout(scrollToBottom, 50);
		}
	});
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="h-full flex">
	<!-- Sidebar -->
	<div style="width: 280px; flex-shrink: 0; background: var(--color-bg-panel); border-right: 1px dashed var(--color-bg-step4); display: flex; flex-direction: column; height: 100vh;">
		<div style="flex: 1; overflow-y: auto; font-family: var(--font-sans);">
			<div style="padding: 1rem 1rem 1rem 1.5rem; border-bottom: 1px dashed var(--color-bg-step4);">
				<p style="display: inline-block; font-size: 13px; font-weight: 500; font-family: var(--font-sans); background: var(--gradient-accent); background-repeat: no-repeat; -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;">Teammates</p>
			</div>
			<div style="padding: 0.5rem 0 60px 0;">
				{#each sidebarItems.filter((x) => x.kind === "teammate") as item}
					<div
						onclick={() => selectedIndex = sidebarItems.indexOf(item)}
						style="padding: 0 1rem 0 1.5rem; cursor: pointer; color: {selectedIndex === sidebarItems.indexOf(item) ? 'var(--color-text)' : 'var(--color-text-muted)'}; background: {selectedIndex === sidebarItems.indexOf(item) ? 'var(--color-bg-element)' : 'transparent'};"
					>
						{item.name}
					</div>
				{/each}
			</div>

			<div style="padding: 1rem 1rem 1rem 1.5rem; border-bottom: 1px dashed var(--color-bg-step4);">
				<p style="display: inline-block; font-size: 13px; font-weight: 500; font-family: var(--font-sans); background: var(--gradient-accent); background-repeat: no-repeat; -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;">Huddles</p>
			</div>
			<div style="padding: 0.5rem 0 60px 0;">
			{#each sidebarItems.filter((x) => x.kind === "huddle") as item}
				<div
					onclick={() => selectedIndex = sidebarItems.indexOf(item)}
					style="padding: 0 1rem 0 1.5rem; cursor: pointer; color: {selectedIndex === sidebarItems.indexOf(item) ? 'var(--color-text)' : 'var(--color-text-muted)'}; background: {selectedIndex === sidebarItems.indexOf(item) ? 'var(--color-bg-element)' : 'transparent'};"
				>
					<div>{item.name}</div>
					{#if item.participants?.length}
						<div style="font-size: 9px; line-height: 1.6; color: #999;">{item.participants.join(', ')}</div>
					{/if}
				</div>
			{/each}
			</div>

			{#if sidebarItems.filter((x) => x.kind === "past").length > 0}
				<div style="padding: 1rem 1rem 1rem 1.5rem; border-bottom: 1px dashed var(--color-bg-step4);">
					<p style="display: inline-block; font-size: 13px; font-weight: 500; font-family: var(--font-sans); background: var(--gradient-accent); background-repeat: no-repeat; -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;">Past Rooms</p>
				</div>
				<div style="padding: 0.5rem 0 60px 0;">
				{#each sidebarItems.filter((x) => x.kind === "past") as item}
					<div
						onclick={() => selectedIndex = sidebarItems.indexOf(item)}
					style="padding: 0 1rem 0 1.5rem; cursor: pointer; color: {selectedIndex === sidebarItems.indexOf(item) ? 'var(--color-text)' : 'var(--color-text-muted)'}; background: {selectedIndex === sidebarItems.indexOf(item) ? 'var(--color-bg-element)' : 'transparent'};"
					>
						<div>{item.name}</div>
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
		<div class="flex-1 overflow-y-auto" style="background: var(--color-bg); padding-bottom: 130px;" bind:this={messagesContainer}>
			<div class="py-2" style="max-width: 570px; display: grid; grid-template-columns: 72px minmax(0, 1fr); gap: 0 12px; margin-left: calc((100vw - 570px) / 2 - 280px); margin-right: auto;">
				{#each currentMessages as msg}
					<div style="padding-top: calc(2rem - 1px); text-align: left; align-self: start;">
						<p style="margin: 0; font-family: var(--font-sans); color: var(--color-text-muted); font-size: 12px; line-height: 1.8;">{msg.sender}</p>
					</div>
					<div style="padding-top: 2rem;">
						<div style="border-left: {msg.sender === 'boss' ? '2px solid #5A3E2E' : '2px solid transparent'}; padding-left: 1.5rem;">
							{#if msg.toolCall}
								{@html renderToolCard(msg.content)}
							{:else}
								<div class="md-content">
									{@html renderMd(msg.content)}
								</div>
							{/if}
						</div>
					</div>
				{/each}
			</div>
		</div>
		<!-- Input bar -->
		<div style="position: absolute; bottom: 0; left: 0; right: 0; background: var(--color-bg);">
		<div style="max-width: 570px; display: grid; grid-template-columns: 72px minmax(0, 1fr); gap: 0 12px; margin-left: calc((100vw - 570px) / 2 - 280px); margin-right: auto;">
			<div style="padding-top: calc(2rem + 0.5rem - 1px); text-align: left; align-self: start;">
				<p style="margin: 0; font-family: var(--font-sans); color: var(--color-text-muted); font-size: 12px; line-height: 1.8;">boss</p>
			</div>
			<div style="padding-top: 2rem; padding-bottom: 1rem;">
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
								style="color: var(--color-text); font-family: var(--font-mono); font-size: 12px; font-weight: 300; border: none; max-height: 200px;"
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
