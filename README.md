<p align="center">
<pre>
 ██╗    ██╗ ██╗  ██████╗   ██████╗  ██╗   ██╗ ███╗   ███╗
 ██║    ██║ ██║ ██╔════╝  ██╔════╝  ██║   ██║ ████╗ ████║
 ██║ █╗ ██║ ██║ ██║  ███╗ ██║  ███╗ ██║   ██║ ██╔████╔██║
 ██║███╗██║ ██║ ██║   ██║ ██║   ██║ ██║   ██║ ██║╚██╔╝██║
 ╚███╔███╔╝ ██║ ╚██████╔╝ ╚██████╔╝ ╚██████╔╝ ██║ ╚═╝ ██║
  ╚══╝╚══╝  ╚═╝  ╚═════╝   ╚═════╝   ╚═════╝  ╚═╝     ╚═╝
</pre>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/wiggum-cli"><img src="https://img.shields.io/npm/v/wiggum-cli.svg" alt="npm version"></a>
  <a href="https://github.com/federiconeri/wiggum-cli/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT%20%2B%20Commons%20Clause-blue" alt="license"></a>
  <img src="https://img.shields.io/node/v/wiggum-cli" alt="node version">
</p>

<p align="center">
  Scan your codebase. Generate specs through AI interviews. Run autonomous coding loops.<br>
  Works with <strong>Claude Code</strong>, Codex, or any coding agent.
</p>

---

## What is Wiggum?

Wiggum is a CLI that plugs into any project and sets up everything an AI coding agent needs to ship features autonomously. It:

1. **Scans** your project — detects frameworks, databases, testing tools, deployment targets, and 80+ technologies
2. **Generates specs** — runs an AI-guided interview to produce detailed, project-aware feature specifications
3. **Runs the loop** — hands the spec to Claude Code (or another agent) and runs an autonomous implement → test → fix cycle

The output is a `.wiggum/` directory containing prompts, scripts, and configuration tailored to your stack. Think of it as the glue between your codebase and your AI coding agent.

## Quick Start

```bash
# Install
npm install -g wiggum-cli

# Initialize in your project
wiggum init

# Create a feature spec via AI interview
wiggum new user-auth

# Run the autonomous coding loop
wiggum run user-auth
```

Or use `npx` without installing:

```bash
npx wiggum-cli init
```

## Interactive Mode

Running `wiggum` with no arguments opens the interactive TUI — the recommended way to use Wiggum:

```bash
$ wiggum

wiggum> /init              # Scan project, configure AI provider
wiggum> /new user-auth     # AI interview → spec
wiggum> /run user-auth     # Autonomous coding loop
wiggum> /exit
```

| Command | Alias | Description |
|---------|-------|-------------|
| `/init` | `/i` | Initialize Wiggum in this project |
| `/new <feature>` | `/n` | Create a new feature spec (AI interview) |
| `/run <feature>` | `/r` | Run the feature development loop |
| `/monitor <feature>` | `/m` | Monitor a running feature |
| `/sync` | `/s` | Re-scan project and update context |
| `/help` | `/h` | Show available commands |
| `/exit` | `/q` | Exit |

## CLI Commands

All commands also work non-interactively for scripts and CI.

### `wiggum init`

Scan the project, detect the tech stack, and generate configuration.

```bash
wiggum init [options]
```

| Flag | Description |
|------|-------------|
| `--provider <name>` | AI provider: `anthropic`, `openai`, or `openrouter` (default: `anthropic`) |
| `-i, --interactive` | Stay in interactive mode after init |
| `-y, --yes` | Accept defaults, skip confirmations |

### `wiggum new <feature>`

Create a feature specification from an AI-powered interview.

```bash
wiggum new <feature> [options]
```

| Flag | Description |
|------|-------------|
| `--ai` | Use AI interview to generate the spec (default in interactive mode) |
| `--provider <name>` | AI provider for spec generation |
| `--model <model>` | Model to use |
| `-e, --edit` | Open in editor after creation |
| `-f, --force` | Overwrite existing spec |

The AI interview has 4 phases:
1. **Context** — share reference URLs or files
2. **Goals** — describe what you want to build
3. **Interview** — AI asks 3–5 clarifying questions
4. **Generation** — produces a detailed, project-specific spec

### `wiggum run <feature>`

Run the autonomous development loop for a feature.

```bash
wiggum run <feature> [options]
```

| Flag | Description |
|------|-------------|
| `--worktree` | Use git worktree for isolation (enables parallel features) |
| `--resume` | Resume an interrupted loop |
| `--model <model>` | Claude model (`opus`, `sonnet`) |
| `--max-iterations <n>` | Max implementation iterations (default: 50) |
| `--max-e2e-attempts <n>` | Max E2E test retries (default: 3) |

### `wiggum monitor <feature>`

Track feature development progress in real-time.

```bash
wiggum monitor <feature> [options]
```

| Flag | Description |
|------|-------------|
| `--interval <seconds>` | Refresh interval (default: 5) |
| `--bash` | Use bash monitor script |

## Generated Files

After `wiggum init`, the following structure is created:

```
.wiggum/
├── config.cjs               # Main configuration
├── prompts/                  # AI prompt templates
│   ├── PROMPT.md            # Implementation prompt
│   ├── PROMPT_feature.md    # Feature planning
│   ├── PROMPT_e2e.md        # E2E testing
│   ├── PROMPT_verify.md     # Verification
│   └── PROMPT_review.md     # PR review
├── scripts/                  # Automation scripts
│   └── feature-loop.sh      # Main loop script
├── specs/                    # Feature specifications
│   └── _example.md          # Example template
└── CLAUDE.md                # Project context for Claude Code
```

## Detection Capabilities

Wiggum detects 80+ technologies across your stack:

| Category | Technologies |
|----------|-------------|
| **Frameworks** | Next.js, React, Vue, Nuxt, Svelte, SvelteKit, Remix, Astro |
| **Package Managers** | npm, yarn, pnpm, bun |
| **Testing** | Jest, Vitest, Playwright, Cypress |
| **Styling** | Tailwind CSS, CSS Modules, Styled Components, Emotion, Sass |
| **Databases** | PostgreSQL, MySQL, SQLite, MongoDB, Redis |
| **ORMs** | Prisma, Drizzle, TypeORM, Mongoose, Kysely |
| **APIs** | REST, GraphQL, tRPC, OpenAPI |
| **State** | Zustand, Jotai, Redux, Pinia, Recoil, MobX, Valtio |
| **UI** | shadcn/ui, Radix, Material UI, Chakra UI, Ant Design, Headless UI |
| **Auth** | NextAuth.js, Clerk, Auth0, Supabase Auth, Lucia, Better Auth |
| **Analytics** | PostHog, Mixpanel, Amplitude, Google Analytics, Plausible |
| **Payments** | Stripe, Paddle, LemonSqueezy |
| **Email** | Resend, SendGrid, Postmark, Mailgun |
| **Deploy** | Vercel, Netlify, Railway, Fly.io, Docker, AWS |
| **Monorepos** | Turborepo, Nx, Lerna, pnpm workspaces |
| **MCP** | Detects MCP server configs, recommends servers based on stack |

## AI Providers

Wiggum requires an API key from one of these providers:

| Provider | Environment Variable |
|----------|---------------------|
| Anthropic | `ANTHROPIC_API_KEY` |
| OpenAI | `OPENAI_API_KEY` |
| OpenRouter | `OPENROUTER_API_KEY` |

Optional services for richer analysis:

| Service | Environment Variable | Purpose |
|---------|---------------------|---------|
| [Tavily](https://tavily.com) | `TAVILY_API_KEY` | Web search for current best practices |
| [Context7](https://context7.com) | `CONTEXT7_API_KEY` | Up-to-date documentation lookup |

API keys are stored locally in `.wiggum/.env.local` and never leave your machine.

## How the AI Works

Wiggum uses a multi-agent architecture for project analysis:

1. **Planning Orchestrator** — creates an analysis plan based on detected stack
2. **Parallel Workers** — Context Enricher explores the codebase while Tech Researchers gather best practices (runs concurrently)
3. **Synthesis** — merges results, detects essential MCP servers
4. **Evaluator-Optimizer** — QA loop that validates and refines the output

## Requirements

- Node.js >= 18.0.0
- Git
- An AI provider API key (Anthropic, OpenAI, or OpenRouter)
- [Claude Code](https://claude.com/claude-code) or another coding agent (for `wiggum run`)

## Contributing

Contributions welcome! See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

```bash
git clone https://github.com/federiconeri/wiggum-cli.git
cd wiggum-cli
npm install
npm run build
npm test
```

## License

MIT + Commons Clause — see [LICENSE](LICENSE) for details.

You can use, modify, and distribute Wiggum freely. You may not sell the software or a service whose value derives substantially from Wiggum's functionality.
