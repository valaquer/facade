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

	const messages: Message[] = [
		{
			role: 'user',
			name: 'Boss',
			agentColor: '#fab283',
			text: 'Read the kitty.conf and tell me what colors are configured.',
		},
		{
			role: 'assistant',
			name: 'Natalie',
			parts: [
				{ type: 'inline', icon: '\u2192', text: 'Read ~/.config/kitty/kitty.conf' },
				{
					type: 'text',
					content:
						'The Kitty config uses a dark theme with these key colors:\n\n- **Background:** `#0a0c10` (dark blue-black)\n- **Foreground:** `#dcdcdc` (light gray)\n- **Cursor:** `#5b8fa8` (steel blue)\n- **Selection:** `#282c34` bg, `#f0ede6` fg\n\nThe ANSI palette uses muted tones -- greens `#1f8f6c`, blues `#337ba8`, magentas `#5b67a8`.',
				},
			],
		},
		{
			role: 'user',
			name: 'Boss',
			agentColor: '#fab283',
			text: 'Change the background to pure black and update the cursor to match.',
		},
		{
			role: 'assistant',
			name: 'Natalie',
			parts: [
				{ type: 'thinking', content: 'The user wants background changed to #000000 and cursor updated. I should change both values in kitty.conf. The cursor currently matches the tab bar accent -- changing it to pure white would provide best contrast on black.' },
				{ type: 'inline', icon: '\u2192', text: 'Read ~/.config/kitty/kitty.conf' },
				{
					type: 'diff',
					title: '\u2190 Edit ~/.config/kitty/kitty.conf',
					lines: [
						{ kind: 'context', oldNum: '27', newNum: '27', text: '# Color theme' },
						{ kind: 'removed', oldNum: '28', newNum: '', text: 'foreground              #dcdcdc' },
						{ kind: 'removed', oldNum: '29', newNum: '', text: 'background              #0a0c10' },
						{ kind: 'added', oldNum: '', newNum: '28', text: 'foreground              #e0e0e0' },
						{ kind: 'added', oldNum: '', newNum: '29', text: 'background              #000000' },
						{ kind: 'context', oldNum: '30', newNum: '30', text: 'selection_foreground     #f0ede6' },
						{ kind: 'context', oldNum: '31', newNum: '31', text: 'selection_background     #282c34' },
						{ kind: 'removed', oldNum: '32', newNum: '', text: 'cursor                  #5b8fa8' },
						{ kind: 'added', oldNum: '', newNum: '32', text: 'cursor                  #ffffff' },
					],
				},
				{
					type: 'text',
					content: 'Updated background to `#000000` and cursor to `#ffffff` for maximum contrast. The foreground was also brightened slightly from `#dcdcdc` to `#e0e0e0`. Changes take effect on next Kitty restart.',
				},
			],
		},
		{
			role: 'user',
			name: 'Boss',
			agentColor: '#fab283',
			text: 'Run a build to make sure nothing broke.',
		},
		{
			role: 'assistant',
			name: 'Natalie',
			parts: [
				{
					type: 'block',
					title: '# Bash npm run build',
					content:
						'vite v6.3.5 building for production...\n\u2713 314 modules transformed.\n.svelte-kit/output/client/_app/immutable/entry/start.js   25.58 kB\n.svelte-kit/output/client/_app/immutable/entry/app.js     12.34 kB\n.svelte-kit/output/server/index.js                        48.91 kB\n\u2713 built in 2.41s',
					overflow: false,
				},
				{
					type: 'text',
					content: 'Build passes -- 0 errors, 0 warnings.',
				},
			],
		},
		// --- Huddle simulation ---
		{
			role: 'user',
			name: 'Boss',
			agentColor: '#fab283',
			text: 'Team, Tokyo is a mess. 28,000 lines of dead code. I want to nuke it and rebuild from scratch. The requirements are crystal clear now. Thoughts?',
		},
		{
			role: 'assistant',
			name: 'Rio',
			parts: [{ type: 'text', content: 'Right call. Tokyo v1 was a prototype that proved the concept. Nuking and rebuilding from clear requirements is cheaper than chasing bugs through a stripped HuggingFace fork that was never designed for our use case.' }],
		},
		{
			role: 'assistant',
			name: 'Natalie',
			parts: [{ type: 'text', content: 'The 28K number included build output. Actual src/ is 11,285 lines. Of those, maybe 3\u20134K are ours. The rest is HuggingFace dead weight \u2013 markdown renderers, file upload UI, audio player, MCP server manager, subscription modals. For v2, the smart middle-ground is clear: study our logic, extract the patterns, rebuild clean.' }],
		},
		{
			role: 'assistant',
			name: 'Zara',
			parts: [{ type: 'text', content: 'From the PM side: we\'ve done this before. Team meetings to huddles was the same pattern \u2013 clean-sheet redesign after the prototype exposed the real requirements. I\'ll track v2 as a new epic. The original OPS-168 stays as-is.' }],
		},
		{
			role: 'user',
			name: 'Boss',
			agentColor: '#fab283',
			text: 'Natalie, I want you to use the ORIGINAL HuggingFace Chat UI. Not the buggy Tokyo code. Identify what parts we need from upstream and recreate a codebase with only those parts.',
		},
		{
			role: 'assistant',
			name: 'Natalie',
			parts: [{ type: 'text', content: 'Correction acknowledged. I was wrong \u2013 I studied the buggy Tokyo fork instead of upstream. Rio steered me wrong too. Corrected course: cloned upstream HF Chat UI fresh. I\'ll surgically extract only what Facade needs.' }],
		},
		{
			role: 'assistant',
			name: 'Rio',
			parts: [{ type: 'text', content: 'I steered Natalie wrong. I told her to study our Tokyo codebase \u2013 Boss wants the opposite. The source of truth is the original upstream HuggingFace Chat UI. My mistake.' }],
		},
		{
			role: 'assistant',
			name: 'Claire',
			parts: [{ type: 'text', content: 'Confirmed \u2013 both Gestalt layers are symlinked to Chica and Natalie. Layer 1 (universal runbook, #151) and Layer 2 (failure pattern library, #152) both resolve to library/skills/ canonical. Deployed this morning.' }],
		},
		{
			role: 'user',
			name: 'Boss',
			agentColor: '#fab283',
			text: 'Claire, did you not tell me earlier today that the skills are "hardlinked" rather than "symlinked"?',
		},
		{
			role: 'assistant',
			name: 'Claire',
			parts: [{ type: 'text', content: 'My apology, Boss \u2013 I may have used the wrong term earlier. I just checked: reconcile-skills.py creates symlinks at the directory level. They are symlinks, not hardlinks. Sorry for the confusion.' }],
		},
		{
			role: 'assistant',
			name: 'Zara',
			parts: [{ type: 'text', content: 'Standing by for Boss\'s answers on the scoping questions before we cut anything in Jira. The layering is clear \u2013 Facade is communication velocity, Kitty is execution. Need the feature set locked before I create the epic.' }],
		},
		{
			role: 'user',
			name: 'Boss',
			agentColor: '#fab283',
			text: 'No need to confuse the whole org. When we have tested Facade end to end and are confident with it, we can roll it out and ask the org to migrate. Until then it stays in this huddle.',
		},
		{
			role: 'assistant',
			name: 'Rio',
			parts: [{ type: 'text', content: 'Clear. Build and test within this group first, org-wide migration later. The additive posture holds during development \u2013 existing mailbox and huddle infrastructure stays untouched until Facade is proven.' }],
		},
		{
			role: 'assistant',
			name: 'Natalie',
			parts: [{
				type: 'text',
				content: `Course corrected. Results:

## Extraction complete \u2013 upstream HF Chat UI stripped to Facade foundation

**Codebase location:** chica/projects/facade-prep/

**What was done:**
- Cloned upstream huggingface/chat-ui fresh (no Tokyo commits)
- Removed ~150 files (all routes except layout/page/error, all components, stores, utils, server code, icons, modals, HF configs)
- Kept only scaffolding (svelte.config, vite.config, tailwind, tsconfig, package.json with stripped deps)
- Rewrote types to remove HF dependencies (MongoDB, @huggingface/inference, etc.)
- Applied dark theme CSS variables from Tokyo
- Stripped package.json from 50+ deps to ~20 essentials

**Verification:**
- \`npm install\`: 268 packages
- \`npm run build\`: clean (0 errors)
- \`svelte-check\`: 0 errors, 0 warnings

**File count:** 10 source files (down from ~200 in upstream)

**Deliverable:** EXTRACTION.md documents every file kept/dropped with rationale. Codebase is buildable and ready for Facade v2 implementation.

This is the clean starting point for Layer 3 RUNBOOK and Project Facade.`
			}],
		},
		{
			role: 'assistant',
			name: 'Zara',
			parts: [{
				type: 'text',
				content: `Here's the Jira status for Project Facade:

| Story | Owner | Status | Notes |
|-------|-------|--------|-------|
| OPS-177 Foundation | Natalie | Done | SQLite + API routes |
| OPS-178 Wiring | Natalie | Done | MCP server + kitten bridge |
| OPS-179 UI | Natalie | Done | Terminal reskin + sidebar |
| OPS-180 Strip | Chica | In Progress | Upstream extraction |
| OPS-181 Layer 3 | Rio | To Do | RUNBOOK project-specific |

All stories under epic OPS-168. Sprint 23 day 2.`
			}],
		},
		{
			role: 'assistant',
			name: 'Rio',
			parts: [{
				type: 'text',
				content: `Gate 1 concern on Natalie's extraction. She kept the *health check endpoint* but dropped the auth middleware that gates it. In production that's fine \u2013 localhost doesn't need auth. But it's worth documenting in KNOWN ISSUES so nobody re-adds auth later thinking it's missing.

> Boss's directive from this morning: "I simply want a codebase that contains all the pieces of the HuggingFace Chat UI that are relevant for us and will allow us to *start* Project Facade."

The extraction meets that bar. Here's the file structure she produced:

\`\`\`
facade/
\u251c\u2500\u2500 src/
\u2502   \u251c\u2500\u2500 routes/
\u2502   \u2502   \u251c\u2500\u2500 +layout.svelte
\u2502   \u2502   \u251c\u2500\u2500 +page.svelte
\u2502   \u2502   \u2514\u2500\u2500 +error.svelte
\u2502   \u251c\u2500\u2500 lib/
\u2502   \u2502   \u2514\u2500\u2500 types.ts
\u2502   \u2514\u2500\u2500 app.html
\u251c\u2500\u2500 svelte.config.js
\u251c\u2500\u2500 vite.config.ts
\u251c\u2500\u2500 tailwind.config.ts
\u2514\u2500\u2500 package.json
\`\`\`

10 files. Clean. Buildable. Gate 1 approved.`
			}],
		},
		{
			role: 'user',
			name: 'Boss',
			agentColor: '#fab283',
			text: 'Chica, give me the current state of the mockup. What did we land on?',
		},
		{
			role: 'assistant',
			name: 'Chica',
			parts: [{
				type: 'text',
				content: `## Facade Mockup \u2013 Current State

All visual decisions locked in this session:

1. **Content width:** 600px max, 64px padding
2. **Font:** JetBrains Mono 300, 12px, \`#CDCCC2\`
3. **Line height:** 1.8
4. **Spacing:** 32px above/below all bordered elements
5. **Labels:** CSS grid, 72px label column, baseline-aligned

---

### Open items

- Markdown rendering via [marked](https://github.com/markedjs/marked) \u2013 all GFM features
- *Obsidianite gradient* on headings, bold, blockquotes, bullets, table headers, \`hr\`
- Code blocks with hover copy button
- Input bar with status rows inside the \`#1e1e1e\` box

> "I am panicking. This looks so beautiful." \u2013 Boss, 16:27

The mockup is at \`chica/projects/facade-mockup/\`, running on localhost:5177. Natalie's real Facade build is at \`natalie/Facade/\`, running on localhost:5173.`
			}],
		},
	];

	let expanded: Record<number, boolean> = $state({});

	function toggleExpand(idx: number) {
		expanded[idx] = !expanded[idx];
	}

	const sidebarTeammates = ['Rio', 'Chica', 'Natalie', 'Zara', 'Omar', 'Claire', 'Gunnar', 'Samara', 'Hana', 'Wyatt', 'Klara', 'Vera'];
	const sidebarHuddles = ['huddle-20260511-141526-natalie', 'huddle-20260510-183214-natalie', 'huddle-20260510-064115-natalie', 'huddle-20260509-165748-natalie'];
	const allSidebarItems = [...sidebarTeammates, ...sidebarHuddles];
	let selectedIndex = $state(0);

	let inputRef: HTMLTextAreaElement | undefined = $state();

	function handleKeydown(e: KeyboardEvent) {
		if (e.ctrlKey && e.key === 'ArrowDown') {
			e.preventDefault();
			selectedIndex = (selectedIndex + 1) % allSidebarItems.length;
		} else if (e.ctrlKey && e.key === 'ArrowUp') {
			e.preventDefault();
			selectedIndex = (selectedIndex - 1 + allSidebarItems.length) % allSidebarItems.length;
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
		<!-- Teammate list -->
		<div style="flex: 1; overflow-y: auto; padding: 0.5rem 0;">
			{#each sidebarTeammates as name, i}
				<div
					onclick={() => selectedIndex = i}
					style="padding: 0 1rem 0 1.5rem; cursor: pointer; color: {selectedIndex === i ? 'var(--color-text)' : 'var(--color-text-muted)'}; background: {selectedIndex === i ? 'var(--color-bg-element)' : 'transparent'};"
				>
					{name}
				</div>
			{/each}
			<div style="height: 4rem;"></div>
			<div style="padding: 0 1rem;">
				<p style="padding-left: 0.5rem; font-size: 13px; font-weight: 500; background: linear-gradient(90deg, #5c9cf5, #9d7cd8); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;">Huddles</p>
			</div>
			<div style="margin: 0.5rem 1rem; border-bottom: 1px solid var(--color-bg-step4);"></div>
			{#each sidebarHuddles as huddle, i}
				{@const idx = sidebarTeammates.length + i}
				<div
					onclick={() => selectedIndex = idx}
					style="padding: 0 1rem 0 1.5rem; cursor: pointer; color: {selectedIndex === idx ? 'var(--color-text)' : 'var(--color-text-muted)'}; background: {selectedIndex === idx ? 'var(--color-bg-element)' : 'transparent'};"
				>
					{huddle}
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
	<!-- Conversation area -->
	<div class="flex-1 overflow-y-auto" style="background: var(--color-bg);">
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

			<!-- Input bar: label cell -->
			<div style="padding-top: calc(2rem + 0.5rem); text-align: left; align-self: start;">
				<p style="color: var(--color-text-muted); font-size: 12px; line-height: 1.8;">Boss</p>
			</div>

			<!-- Input bar: content cell -->
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
