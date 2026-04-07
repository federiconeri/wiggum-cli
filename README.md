<p align="center">
  <img src=".github/logo.svg" alt="WIGGUM" width="650">
</p>

<p align="center">
  <strong>Plug into any codebase. Generate specs. Run autonomous feature loops with Claude Code or Codex.</strong>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/wiggum-cli"><img src="https://img.shields.io/npm/v/wiggum-cli?color=F8DB27&labelColor=1a1a1a&style=flat-square" alt="npm"></a>
  <a href="https://www.npmjs.com/package/wiggum-cli"><img src="https://img.shields.io/npm/dm/wiggum-cli?color=F8DB27&labelColor=1a1a1a&style=flat-square" alt="downloads"></a>
  <a href="https://github.com/federiconeri/wiggum-cli/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/federiconeri/wiggum-cli/ci.yml?branch=main&color=F8DB27&labelColor=1a1a1a&style=flat-square&label=CI" alt="CI"></a>
  <a href="https://github.com/federiconeri/wiggum-cli/stargazers"><img src="https://img.shields.io/github/stars/federiconeri/wiggum-cli?color=F8DB27&labelColor=1a1a1a&style=flat-square" alt="stars"></a>
  <a href="https://github.com/federiconeri/wiggum-cli/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT%20+%20Commons%20Clause-F8DB27?labelColor=1a1a1a&style=flat-square" alt="license"></a>
  <img src="https://img.shields.io/node/v/wiggum-cli?color=F8DB27&labelColor=1a1a1a&style=flat-square" alt="node">
</p>

<p align="center">
  <a href="#-quick-start">Quick Start</a> ·
  <a href="#-how-it-works">How It Works</a> ·
  <a href="https://wiggum.app">Website</a> ·
  <a href="https://wiggum.app/blog">Blog</a> ·
  <a href="https://wiggum.app/pricing">Pricing</a> ·
  <a href="https://github.com/federiconeri/wiggum-cli/issues">Issues</a>
</p>

<p align="center">
  <video src="https://github.com/user-attachments/assets/817edf0c-a7aa-418f-bf85-499be520fd94" width="800" controls></video>
</p>

---

## What is Wiggum?

Wiggum is an **AI agent CLI** that plugs into any codebase and prepares it for autonomous feature development.

It works in two phases. First, **Wiggum itself is the agent**: it scans your project, detects your stack, and runs an AI-guided interview to produce detailed specs, prompts, and scripts tailored to your codebase. Then it delegates coding loops to [Claude Code](https://docs.anthropic.com/en/docs/claude-code) or [Codex CLI](https://github.com/openai/codex), running **implement → test → fix** cycles until completion.

Plug & play. Point it at a repo. It figures out the rest.

```
         Wiggum (agent)                    Coding Agent
  ┌────────────────────────────┐    ┌────────────────────┐
  │                            │    │                    │
  │  Scan ──▶ Interview ──▶ Spec ──▶  Run loops           │
  │  detect      AI-guided   .ralph/   implement         │
  │  80+ tech    questions   specs     test + fix        │
  │  plug&play   prompts     guides    until done        │
  │                            │    │                    │
  └────────────────────────────┘    └────────────────────┘
       runs in your terminal          Claude Code / Codex CLI
```

---

## 🚀 Quick Start

```bash
npm install -g wiggum-cli
```

Then, in your project:

```bash
wiggum init                  # Scan project, configure AI provider
wiggum new user-auth         # AI interview → feature spec
wiggum run user-auth         # Autonomous coding loop
wiggum agent --dry-run       # Preview backlog automation plan
```

Or skip the global install:

```bash
npx wiggum-cli init
```

---

## ⚡ Features

🔍 **Smart Detection** — Auto-detects 80+ technologies: frameworks, databases, ORMs, testing tools, deployment targets, MCP servers, and more.

🎙️ **AI-Guided Interviews** — Generates detailed, project-aware feature specs through a structured 4-phase interview. No more blank-page problem.

🔁 **Autonomous Coding Loops** — Hands specs to Claude Code or Codex CLI and runs implement → test → fix cycles with git worktree isolation.

✨ **Spec Autocomplete** — AI pre-fills spec names from your codebase context when running `/run`.

📥 **Action Inbox** — Review AI decisions inline without breaking your flow. The loop pauses, you approve or redirect, it continues.

📊 **Run Summaries** — See exactly what changed and why after each loop completes, with activity feed and diff stats.

🧠 **Backlog Agent** — Run `wiggum agent` to execute prioritized GitHub backlog items with dependency-aware scheduling and review-mode controls.

🗂️ **Issue Intake** — Use `/issue` in TUI to browse GitHub issues and start specs directly from issue context.

📋 **Tailored Prompts** — Generates prompts, guides, and scripts specific to your stack. Not generic templates — actual context about *your* project.

🔌 **BYOK** — Bring your own API keys. Works with Anthropic, OpenAI, or OpenRouter. Keys stay local, never leave your machine.

🖥️ **Interactive TUI** — Full terminal interface with persistent session state. No flags to remember.

---

## 🎯 How It Works

### 1. Scan

```bash
wiggum init
```

Wiggum reads your `package.json`, config files, source tree, and directory structure. It then runs a simplified analysis pipeline:

1. **Codebase Analyzer (unified agent)** — builds project context, commands, and implementation guidance from your actual codebase
2. **MCP Detection** — maps detected stack to essential/recommended MCP server suggestions
3. **Context Persistence** — saves enriched context and generated assets under `.ralph/`

Output: a `.ralph/` directory with configuration, prompts, guides, and scripts — all tuned to your project.

### 2. Spec

```bash
wiggum new payment-flow
```

An AI-guided interview walks you through:

| Phase | What happens |
|-------|-------------|
| **Context** | Share reference URLs, docs, or files |
| **Goals** | Describe what you want to build |
| **Interview** | AI asks 3–5 clarifying questions |
| **Generation** | Produces a detailed feature spec in `.ralph/specs/` |

### 3. Loop

```bash
wiggum run payment-flow
```

Wiggum hands the spec + prompts + project context to Claude Code or Codex CLI and runs an autonomous loop:

```
implement → run tests → fix failures → repeat
```

Supports git worktree isolation (`--worktree`) for running multiple features in parallel.

---

## 🖥️ Interactive Mode

Running `wiggum` with no arguments opens the TUI — the recommended way to use Wiggum:

```bash
$ wiggum
```

| Command | Alias | Description |
|---------|-------|-------------|
| `/init` | `/i` | Scan project, configure AI provider |
| `/new <feature>` | `/n` | AI interview → feature spec |
| `/run <feature>` | `/r` | Run autonomous coding loop |
| `/monitor <feature>` | `/m` | Monitor a running feature |
| `/issue [query]` | — | Browse GitHub issues and start a spec |
| `/agent [flags]` | `/a` | Run autonomous backlog executor |
| `/sync` | `/s` | Re-scan project, update context |
| `/config [...]` | `/cfg` | Manage API keys and loop settings |
| `/help` | `/h` | Show commands |
| `/exit` | `/q` | Exit |

---

## 📁 Generated Files

```
.ralph/
├── ralph.config.cjs          # Stack detection results + loop config
├── prompts/
│   ├── PROMPT.md             # Implementation prompt
│   ├── PROMPT_feature.md     # Feature planning
│   ├── PROMPT_e2e.md         # E2E testing
│   ├── PROMPT_verify.md      # Verification
│   ├── PROMPT_review_manual.md  # PR review (manual - stop at PR)
│   ├── PROMPT_review_auto.md    # PR review (auto - review, no merge)
│   └── PROMPT_review_merge.md   # PR review (merge - review + auto-merge)
├── guides/
│   ├── AGENTS.md             # Agent instructions (CLAUDE.md)
│   ├── FRONTEND.md           # Frontend patterns
│   ├── SECURITY.md           # Security guidelines
│   └── PERFORMANCE.md        # Performance patterns
├── scripts/
│   └── feature-loop.sh       # Main loop script
├── specs/
│   └── _example.md           # Example spec template
└── LEARNINGS.md              # Accumulated project learnings
```

---

## 🔧 CLI Reference

<details>
<summary><code>wiggum init [options]</code></summary>

Scan the project, detect the tech stack, generate configuration.

| Flag | Description |
|------|-------------|
| `--provider <name>` | AI provider: `anthropic`, `openai`, `openrouter` (default: `anthropic`) |
| `-i, --interactive` | Stay in interactive mode after init |
| `-y, --yes` | Accept defaults, skip confirmations |

</details>

<details>
<summary><code>wiggum new &lt;feature&gt; [options]</code></summary>

Create a feature specification via AI-powered interview.

| Flag | Description |
|------|-------------|
| `--provider <name>` | AI provider for spec generation |
| `--model <model>` | Model to use |
| `--issue <number\|url>` | Add GitHub issue as context (repeatable) |
| `--context <url\|path>` | Add URL/file context (repeatable) |
| `--auto` | Headless mode (skip TUI) |
| `--goals <description>` | Feature goals for `--auto` mode |
| `-e, --edit` | Open in editor after creation |
| `-f, --force` | Overwrite existing spec |

</details>

<details>
<summary><code>wiggum run &lt;feature&gt; [options]</code></summary>

Run the autonomous development loop.

| Flag | Description |
|------|-------------|
| `--worktree` | Git worktree isolation (parallel features) |
| `--resume` | Resume an interrupted loop |
| `--model <model>` | Model id override (applied per CLI; Codex defaults to `gpt-5.3-codex`) |
| `--cli <cli>` | Implementation CLI: `claude` or `codex` |
| `--review-cli <cli>` | Review CLI: `claude` or `codex` |
| `--max-iterations <n>` | Max iterations (default: 10) |
| `--max-e2e-attempts <n>` | Max E2E retries (default: 5) |
| `--review-mode <mode>` | `manual` (stop at PR), `auto` (review, no merge), or `merge` (review + merge). Default: `manual` |

</details>

For loop models:
- Claude CLI phases use `defaultModel` / `planningModel` (defaults: `sonnet` / `opus`).
- Codex CLI phases default to `gpt-5.3-codex` across all phases.

<details>
<summary><code>wiggum sync</code></summary>

Re-scan project and refresh saved context (`.ralph/.context.json`) using current provider/model settings.

</details>

<details>
<summary><code>wiggum monitor &lt;feature&gt; [options]</code></summary>

Track feature development progress in real-time.

| Flag | Description |
|------|-------------|
| `--interval <seconds>` | Refresh interval (default: 5) |
| `--bash` | Use bash monitor script |
| `--stream` | Force headless streaming monitor output |

</details>

<details>
<summary><code>wiggum agent [options]</code></summary>

Run the autonomous backlog executor (GitHub issue queue + dependency-aware scheduling).

| Flag | Description |
|------|-------------|
| `--model <model>` | Model override (defaults from `ralph.config.cjs`) |
| `--max-items <n>` | Max issues to process before stopping |
| `--max-steps <n>` | Max agent steps before stopping |
| `--labels <l1,l2>` | Only process issues matching these labels |
| `--issues <n1,n2,...>` | Only process specific issue numbers |
| `--review-mode <mode>` | `manual`, `auto`, or `merge` |
| `--dry-run` | Plan actions without executing |
| `--stream` | Stream output instead of waiting for final response |
| `--diagnose-gh` | Run GitHub connectivity diagnostics for agent flows |

</details>

---

## 🔌 AI Providers

Wiggum requires an API key from one of these providers:

| Provider | Environment Variable |
|----------|---------------------|
| Anthropic | `ANTHROPIC_API_KEY` |
| OpenAI | `OPENAI_API_KEY` |
| OpenRouter | `OPENROUTER_API_KEY` |

Optional services for deeper analysis:

| Service | Variable | Purpose |
|---------|----------|---------|
| [Tavily](https://tavily.com) | `TAVILY_API_KEY` | Web search for current best practices |
| [Context7](https://context7.com) | `CONTEXT7_API_KEY` | Up-to-date documentation lookup |

Keys are stored in `.ralph/.env.local` and never leave your machine.

---

<details>
<summary><h2>🔍 Detection Capabilities (80+ technologies)</h2></summary>

| Category | Technologies |
|----------|-------------|
| **Frameworks** | Next.js (App/Pages Router), React, Vue, Nuxt, Svelte, SvelteKit, Remix, Astro |
| **Package Managers** | npm, yarn, pnpm, bun |
| **Testing** | Jest, Vitest, Playwright, Cypress |
| **Styling** | Tailwind CSS, CSS Modules, Styled Components, Emotion, Sass |
| **Databases** | PostgreSQL, MySQL, SQLite, MongoDB, Redis |
| **ORMs** | Prisma, Drizzle, TypeORM, Mongoose, Kysely |
| **APIs** | REST, GraphQL, tRPC, OpenAPI |
| **State** | Zustand, Jotai, Redux, Pinia, Recoil, MobX, Valtio |
| **UI Libraries** | shadcn/ui, Radix, Material UI, Chakra UI, Ant Design, Headless UI |
| **Auth** | NextAuth.js, Clerk, Auth0, Supabase Auth, Lucia, Better Auth |
| **Analytics** | PostHog, Mixpanel, Amplitude, Google Analytics, Plausible |
| **Payments** | Stripe, Paddle, LemonSqueezy |
| **Email** | Resend, SendGrid, Postmark, Mailgun |
| **Deployment** | Vercel, Netlify, Railway, Fly.io, Docker, AWS |
| **Monorepos** | Turborepo, Nx, Lerna, pnpm workspaces |
| **MCP** | Detects MCP server/client configs, recommends servers based on stack |

</details>

---

## 📋 Requirements

- **Node.js** >= 18.0.0
- **Git** (for worktree features)
- **GitHub CLI (`gh`)** for `/issue` browsing and backlog agent operations
- An AI provider API key (Anthropic, OpenAI, or OpenRouter)
- A supported coding CLI for loop execution: [Claude Code](https://docs.anthropic.com/en/docs/claude-code) and/or [Codex CLI](https://github.com/openai/codex)

---

## 🤝 Contributing

Contributions welcome! See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

```bash
git clone https://github.com/federiconeri/wiggum-cli.git
cd wiggum-cli
npm install
npm run build
npm test
```

---

## 📖 Learn More

- [What Is Wiggum CLI?](https://wiggum.app/blog/what-is-wiggum-cli) — Overview of the autonomous coding agent
- [What Is the Ralph Loop?](https://wiggum.app/blog/what-is-the-ralph-loop) — Deep dive into the Ralph loop methodology
- [Wiggum vs Bash Scripts](https://wiggum.app/blog/wiggum-vs-ralph-wiggum-scripts) — Why spec generation matters
- [Roadmap](https://wiggum.app/roadmap) — What's coming next
- [Changelog](https://wiggum.app/changelog) — Release history

---

## 📄 License

**MIT + Commons Clause** — see [LICENSE](LICENSE).

You can use, modify, and distribute Wiggum freely. You may **not** sell the software or a service whose value derives substantially from Wiggum's functionality.

---

<p align="center">
  Built on the <a href="https://ghuntley.com/ralph/">Ralph loop technique</a> by Geoffrey Huntley
</p>
