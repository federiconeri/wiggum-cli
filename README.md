<h1 align="center">
  <br>
  <img src="https://img.shields.io/badge/%E2%96%88%E2%96%88-wiggum-F8DB27?style=for-the-badge&labelColor=1a1a1a" alt="wiggum" height="40">
  <br>
</h1>

<p align="center">
  <strong>Scan your codebase. Generate specs. Ship features while you sleep.</strong>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/wiggum-cli"><img src="https://img.shields.io/npm/v/wiggum-cli?color=F8DB27&labelColor=1a1a1a&style=flat-square" alt="npm"></a>
  <a href="https://www.npmjs.com/package/wiggum-cli"><img src="https://img.shields.io/npm/dm/wiggum-cli?color=F8DB27&labelColor=1a1a1a&style=flat-square" alt="downloads"></a>
  <a href="https://github.com/federiconeri/wiggum-cli/stargazers"><img src="https://img.shields.io/github/stars/federiconeri/wiggum-cli?color=F8DB27&labelColor=1a1a1a&style=flat-square" alt="stars"></a>
  <a href="https://github.com/federiconeri/wiggum-cli/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT%20+%20Commons%20Clause-F8DB27?labelColor=1a1a1a&style=flat-square" alt="license"></a>
  <img src="https://img.shields.io/node/v/wiggum-cli?color=F8DB27&labelColor=1a1a1a&style=flat-square" alt="node">
</p>

<p align="center">
  <a href="#-quick-start">Quick Start</a> ·
  <a href="#-how-it-works">How It Works</a> ·
  <a href="https://wiggum.app">Website</a> ·
  <a href="https://github.com/federiconeri/wiggum-cli/issues">Issues</a>
</p>

---

## What is Wiggum?

Wiggum is a CLI that plugs into **any project** and sets up everything an AI coding agent needs to ship features autonomously.

You bring the codebase. Wiggum scans it, interviews you about what to build, and produces specs + prompts + scripts tailored to your stack. Then it hands everything to [Claude Code](https://docs.anthropic.com/en/docs/claude-code), Codex, or any coding agent and runs an autonomous **implement → test → fix** loop until the feature is done.

```
  ┌─────────┐      ┌──────────┐      ┌──────────┐
  │  Scan   │ ───▶ │  Spec    │ ───▶ │  Loop    │
  │ 80+ tech│      │ AI interview    │ autonomous│
  │ detected│      │ project-aware   │ impl+test │
  └─────────┘      └──────────┘      └──────────┘
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
```

Or skip the global install:

```bash
npx wiggum-cli init
```

---

## ⚡ Features

🔍 **Smart Detection** — Auto-detects 80+ technologies: frameworks, databases, ORMs, testing tools, deployment targets, MCP servers, and more.

🎙️ **AI-Guided Interviews** — Generates detailed, project-aware feature specs through a structured 4-phase interview. No more blank-page problem.

🔁 **Autonomous Coding Loops** — Hands specs to Claude Code (or any agent) and runs implement → test → fix cycles with git worktree isolation.

📋 **Tailored Prompts** — Generates prompts, guides, and scripts specific to your stack. Not generic templates — actual context about *your* project.

🔌 **BYOK** — Bring your own API keys. Works with Anthropic, OpenAI, or OpenRouter. Keys stay local, never leave your machine.

🖥️ **Interactive TUI** — Full terminal interface with persistent session state. No flags to remember.

---

## 🎯 How It Works

### 1. Scan

```bash
wiggum init
```

Wiggum reads your `package.json`, config files, source tree, and directory structure. A multi-agent AI system then analyzes the results:

1. **Planning Orchestrator** — creates an analysis plan based on detected stack
2. **Parallel Workers** — Context Enricher explores code while Tech Researchers gather best practices
3. **Synthesis** — merges results, detects relevant MCP servers
4. **Evaluator-Optimizer** — QA loop that validates and refines the output

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

Wiggum hands the spec + prompts + project context to your coding agent and runs an autonomous loop:

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
| `/sync` | `/s` | Re-scan project, update context |
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
│   └── PROMPT_review.md      # PR review
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
| `--ai` | Use AI interview (default in TUI mode) |
| `--provider <name>` | AI provider for spec generation |
| `--model <model>` | Model to use |
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
| `--model <model>` | Claude model (`opus`, `sonnet`) |
| `--max-iterations <n>` | Max iterations (default: 50) |
| `--max-e2e-attempts <n>` | Max E2E retries (default: 3) |

</details>

<details>
<summary><code>wiggum monitor &lt;feature&gt; [options]</code></summary>

Track feature development progress in real-time.

| Flag | Description |
|------|-------------|
| `--interval <seconds>` | Refresh interval (default: 5) |
| `--bash` | Use bash monitor script |

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
- An AI provider API key (Anthropic, OpenAI, or OpenRouter)
- [Claude Code](https://docs.anthropic.com/en/docs/claude-code) or another coding agent (for `wiggum run`)

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

## 📄 License

**MIT + Commons Clause** — see [LICENSE](LICENSE).

You can use, modify, and distribute Wiggum freely. You may **not** sell the software or a service whose value derives substantially from Wiggum's functionality.

---

<p align="center">
  Built on the <a href="https://ghuntley.com/ralph/">Ralph loop technique</a> by Geoffrey Huntley
</p>
