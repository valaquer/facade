<script lang="ts">
	import { marked } from 'marked';
	import { onMount } from 'svelte';

	marked.setOptions({ breaks: true, gfm: true });

	function renderMd(content: string): string {
		return marked.parse(content) as string;
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

		// Inject copy buttons into all pre>code blocks
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
		// Initial pass
		document.querySelectorAll('.md-content pre').forEach((pre) => {
			if (pre.querySelector('.copy-btn')) return;
			const btn = document.createElement('button');
			btn.className = 'copy-btn';
			btn.textContent = 'Copy';
			pre.appendChild(btn);
		});
	});

	type InlineTool = {
		type: 'inline';
		icon: string;
		text: string;
		iconColor?: string;
	};

	type BlockTool = {
		type: 'block';
		title: string;
		content: string;
		overflow?: boolean;
	};

	type DiffBlock = {
		type: 'diff';
		title: string;
		lines: { kind: 'added' | 'removed' | 'context'; oldNum?: string; newNum?: string; text: string }[];
	};

	type TextBlock = {
		type: 'text';
		content: string;
	};

	type ThinkingBlock = {
		type: 'thinking';
		content: string;
	};

	type UserMsg = {
		role: 'user';
		name: string;
		agentColor: string;
		text: string;
		files?: { name: string; badge: string; badgeColor: string }[];
	};

	type AssistantMsg = {
		role: 'assistant';
		name: string;
		parts: (InlineTool | BlockTool | DiffBlock | TextBlock | ThinkingBlock)[];
	};

	type Message = UserMsg | AssistantMsg;

	const messages: Message[] = [];

	let expanded: Record<number, boolean> = $state({});

	function toggleExpand(idx: number) {
		expanded[idx] = !expanded[idx];
	}

	type SidebarItem = { id: string; name: string; kind: "teammate" | "huddle" };

	let sidebarItems = $state<SidebarItem[]>([]);
	let selectedIndex = $state(0);

	async function loadSidebar() {
		try {
			const res = await fetch("/api/rooms");
			const data = await res.json();
			const items: SidebarItem[] = [
				...(data.teammates ?? []).map((t: { id: string; name: string }) => ({ id: t.id, name: t.name, kind: "teammate" as const })),
				...(data.huddles ?? []).map((h: { id: string; title: string }) => ({ id: h.id, name: h.title, kind: "huddle" as const })),
			];
			sidebarItems = items;
			if (selectedIndex >= items.length) selectedIndex = 0;
		} catch {
			sidebarItems = [];
		}
	}

	let eventSource: EventSource | undefined;

	onMount(() => {
		loadSidebar();
		eventSource = new EventSource("/api/events");
		eventSource.onmessage = () => {
			loadSidebar();
		};
	});

	import { onDestroy } from "svelte";
	onDestroy(() => {
		eventSource?.close();
	});

	let inputRef: HTMLTextAreaElement | undefined = $state();

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
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="h-full flex">
	<!-- Sidebar -->
	<div style="width: 280px; flex-shrink: 0; background: var(--color-bg-panel); border-right: 1px solid var(--color-bg-step4); display: flex; flex-direction: column; height: 100vh;">
		<!-- Header -->
		<div style="padding: 1rem 1rem 1rem 1.5rem; border-bottom: 1px solid var(--color-bg-step4);">
			<p style="font-size: 13px; font-weight: 500; background: linear-gradient(90deg, #5c9cf5, #9d7cd8); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;">Teammates</p>
		</div>
		<!-- Sidebar list -->
		<div style="flex: 1; overflow-y: auto; padding: 0.5rem 0;">
			{#each sidebarItems as item, i}
				<div
					onclick={() => selectedIndex = i}
					style="padding: 0 1rem 0 1.5rem; cursor: pointer; color: {selectedIndex === i ? 'var(--color-text)' : 'var(--color-text-muted)'}; background: {selectedIndex === i ? 'var(--color-bg-element)' : 'transparent'};"
				>
					{item.name}
				</div>
			{/each}
		</div>
		<!-- Footer -->
		<div style="padding: 0.75rem 1rem; border-top: 1px solid var(--color-bg-step4); font-size: 11px; color: var(--color-text-muted);">
			provoque.ai
		</div>
	</div>

	<!-- Main content — chat centered on full screen, not on remaining space -->
	<div class="flex-1 flex flex-col" style="height: 100vh;">
	<!-- Conversation area (scrollable) -->
	<div class="flex-1 overflow-y-auto" style="background: var(--color-bg); padding-bottom: 1rem;">
		<div class="py-2" style="max-width: 570px; display: grid; grid-template-columns: 72px 1fr; gap: 0 12px; margin-left: calc((100vw - 570px) / 2 - 280px); margin-right: auto;">

			{#each messages as msg, msgIdx}
				<!-- Label cell -->
				<div style="padding-top: 2rem; text-align: left; align-self: start;">
					<p style="color: var(--color-text-muted); font-size: 12px; line-height: 1.8;">{msg.name}</p>
				</div>

				<!-- Content cell -->
				<div style="padding-top: 2rem;">
				{#if msg.role === 'user'}
					<!-- User message bubble -->
					<div
						class="hover:brightness-110 transition-all"
						style="border-left: 2px solid {msg.agentColor}; background: var(--color-bg-panel);"
					>
						<div style="padding: 0 0.75rem 0.5rem calc(1.5rem - 2px);">
							<p style="color: var(--color-text);">{msg.text}</p>
							{#if msg.files}
								<div style="display: flex; gap: 0.5rem; margin-top: 0.5rem; flex-wrap: wrap;">
									{#each msg.files as file}
										<span>
											<span style="padding: 0 0.25rem; color: var(--color-bg); background: {file.badgeColor};">{file.badge}</span>
											<span style="padding: 0 0.25rem; background: var(--color-bg-element); color: var(--color-text-muted);">{file.name}</span>
										</span>
									{/each}
								</div>
							{/if}
						</div>
					</div>
				{:else}
					<!-- Assistant message parts -->
					{#each msg.parts as part, partIdx}
						{#if part.type === 'thinking'}
							<div
								style="{partIdx === 0 ? '' : 'margin-top: 2rem;'} margin-bottom: 2rem; border-left: 2px solid var(--color-bg-element); padding-left: 0.5rem; opacity: 0.6;"
							>
								<p style="color: var(--color-text-muted); font-style: italic; font-size: 11px;">
									<span style="font-style: italic;">Thinking:</span>
									{part.content}
								</p>
							</div>
						{:else if part.type === 'text'}
							<div class="md-content" style="{partIdx === 0 ? '' : 'margin-top: 0.5rem;'} padding-left: 1.5rem;">
								{@html renderMd(part.content)}
							</div>
						{:else if part.type === 'inline'}
							<div style="{partIdx === 0 ? '' : 'margin-top: 0.25rem;'} padding-left: 1.5rem;">
								<p style="color: var(--color-text-muted);">
									<span style="color: {part.iconColor || 'var(--color-text-muted)'}">{part.icon}</span>
									{part.text}
								</p>
							</div>
						{:else if part.type === 'block'}
							<div
								style="{partIdx === 0 ? '' : 'margin-top: 2rem;'} margin-bottom: 2rem; border-left: 2px solid var(--color-bg); background: var(--color-bg-panel); padding: 0.5rem 0 0.5rem 1rem;"
							>
								<p style="padding-left: 1.5rem; color: var(--color-text-muted);">{part.title}</p>
								<div style="margin-top: 0.5rem; padding-left: 1.5rem;">
									<pre style="color: var(--color-text); font-size: 11px; white-space: pre-wrap;">{part.content}</pre>
								</div>
								{#if part.overflow}
									<p
										style="margin-top: 0.25rem; padding-left: 1.5rem; color: var(--color-text-muted); font-size: 11px; cursor: pointer;"
										onclick={() => toggleExpand(msgIdx * 100 + partIdx)}
									>
										{expanded[msgIdx * 100 + partIdx] ? 'Click to collapse' : 'Click to expand'}
									</p>
								{/if}
							</div>
						{:else if part.type === 'diff'}
							<div
								style="margin: 2rem 0; border-left: 2px solid var(--color-bg); background: var(--color-bg-panel); padding: 0.5rem 0 0.5rem 1rem;"
							>
								<p style="padding-left: 1.5rem; color: var(--color-text-muted);">{part.title}</p>
								<div style="margin-top: 0.5rem; padding-left: 0.5rem;">
									{#each part.lines as line}
										<div
											style="display: flex; font-size: 11px; background: {line.kind === 'added'
												? 'var(--color-diff-added-bg)'
												: line.kind === 'removed'
													? 'var(--color-diff-removed-bg)'
													: 'var(--color-bg-panel)'};"
										>
											<span
												style="width: 2rem; text-align: right; padding-right: 0.5rem; user-select: none; flex-shrink: 0; color: var(--color-diff-line-number); background: {line.kind === 'added'
													? 'var(--color-diff-added-ln-bg)'
													: line.kind === 'removed'
														? 'var(--color-diff-removed-ln-bg)'
														: 'var(--color-bg-panel)'};"
											>
												{line.oldNum || ' '}
											</span>
											<span
												style="width: 2rem; text-align: right; padding-right: 0.5rem; user-select: none; flex-shrink: 0; color: var(--color-diff-line-number); background: {line.kind === 'added'
													? 'var(--color-diff-added-ln-bg)'
													: line.kind === 'removed'
														? 'var(--color-diff-removed-ln-bg)'
														: 'var(--color-bg-panel)'};"
											>
												{line.newNum || ' '}
											</span>
											<span
												style="width: 1rem; text-align: center; user-select: none; flex-shrink: 0; color: {line.kind === 'added'
													? 'var(--color-diff-highlight-added)'
													: line.kind === 'removed'
														? 'var(--color-diff-highlight-removed)'
														: 'var(--color-text-muted)'};"
											>
												{line.kind === 'added' ? '+' : line.kind === 'removed' ? '-' : ' '}
											</span>
											<span
												style="flex: 1; padding-left: 0.25rem; color: {line.kind === 'added'
													? 'var(--color-diff-added)'
													: line.kind === 'removed'
														? 'var(--color-diff-removed)'
														: 'var(--color-text)'};"
											>
												{line.text}
											</span>
										</div>
									{/each}
								</div>
							</div>
						{/if}
					{/each}
				{/if}
				</div>
			{/each}
		</div>
	</div>
	<!-- Input bar (fixed at bottom, outside scroll) -->
	<div style="width: 100%; flex-shrink: 0;">
	<div style="max-width: 570px; display: grid; grid-template-columns: 72px 1fr; gap: 0 12px; margin-left: calc((100vw - 570px) / 2 - 280px); margin-right: auto;">
		<div style="padding-top: calc(2rem + 0.5rem); text-align: left; align-self: start;">
			<p style="color: var(--color-text-muted); font-size: 12px; line-height: 1.8;">Boss</p>
		</div>
		<div style="padding-top: 2rem; padding-bottom: 1rem;">
			<div style="border-left: 2px solid var(--color-border);">
				<div style="padding: 0.5rem 1rem 0.5rem 1rem; background: var(--color-bg-element);">
					<textarea
						bind:this={inputRef}
						class="w-full bg-transparent outline-none resize-none"
						rows="1"
						placeholder="Ask anything..."
						style="color: var(--color-text); font-family: var(--font-mono); font-size: 12px; font-weight: 300; border: none;"
					></textarea>
					<div style="padding-top: 0.5rem; display: flex; flex-direction: column; align-items: flex-end; gap: 1px;">
						<p style="color: var(--color-text-muted); font-size: 11px;">
							Build &middot; DeepSeek V4 Flash &middot; OpenCode Go &middot; 186.3K (19%) &middot; high
						</p>
						<p style="color: var(--color-text-muted); font-size: 11px;">
							$0.14/M input &middot; $0.28/M output &middot; tools
						</p>
					</div>
				</div>
			</div>
		</div>
	</div>
	</div>
	</div>
</div>
