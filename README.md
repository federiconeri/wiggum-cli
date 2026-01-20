# wiggum-cli

**AI-powered feature development loop CLI** - Auto-detect your tech stack and generate intelligent development environments.

```
 ██╗    ██╗ ██╗  ██████╗   ██████╗  ██╗   ██╗ ███╗   ███╗
 ██║    ██║ ██║ ██╔════╝  ██╔════╝  ██║   ██║ ████╗ ████║
 ██║ █╗ ██║ ██║ ██║  ███╗ ██║  ███╗ ██║   ██║ ██╔████╔██║
 ██║███╗██║ ██║ ██║   ██║ ██║   ██║ ██║   ██║ ██║╚██╔╝██║
 ╚███╔███╔╝ ██║ ╚██████╔╝ ╚██████╔╝ ╚██████╔╝ ██║ ╚═╝ ██║
  ╚══╝╚══╝  ╚═╝  ╚═════╝   ╚═════╝   ╚═════╝  ╚═╝     ╚═╝
                        C  L  I
```
*Simpson Yellow (#FED90F) branding*

## Installation

```bash
# Initialize in your project (recommended)
npx wiggum-cli init

# Or install globally
npm install -g wiggum-cli
```

## Quick Start

```bash
# 1. Initialize Wiggum in your project
npx wiggum-cli init

# 2. Create a new feature specification
wiggum new my-feature

# 3. Edit the spec file (opens in your editor)
wiggum new my-feature --edit

# 4. Run the feature development loop
wiggum run my-feature

# 5. Monitor progress in real-time
wiggum monitor my-feature
```

## Commands

### `wiggum init`

Initialize Wiggum in the current project. Uses AI to analyze your codebase, detect the tech stack, and generate intelligent configuration files.

```bash
wiggum init [options]
```

**Options:**
| Flag | Description |
|------|-------------|
| `--provider <name>` | AI provider: `anthropic`, `openai`, or `openrouter` (default: `anthropic`) |
| `-y, --yes` | Accept defaults and skip confirmations |

**Examples:**
```bash
# Initialize with AI analysis (interactive)
wiggum init

# Initialize with OpenAI provider
wiggum init --provider openai

# Non-interactive mode (for CI/scripts)
wiggum init --yes
```

---

### `wiggum run <feature>`

Run the feature development loop for a specific feature. Executes the AI-driven implementation workflow.

```bash
wiggum run <feature> [options]
```

**Options:**
| Flag | Description |
|------|-------------|
| `--worktree` | Use git worktree for isolation (enables parallel execution) |
| `--resume` | Resume an interrupted loop (reuses existing branch/worktree) |
| `--model <model>` | Claude model to use (e.g., `opus`, `sonnet`) |
| `--max-iterations <n>` | Maximum implementation iterations (default: 50) |
| `--max-e2e-attempts <n>` | Maximum E2E test retry attempts (default: 3) |

**Examples:**
```bash
# Run the feature loop
wiggum run user-authentication

# Run with git worktree isolation
wiggum run payment-flow --worktree

# Resume an interrupted session
wiggum run payment-flow --resume

# Use specific model with iteration limits
wiggum run my-feature --model opus --max-iterations 30
```

---

### `wiggum monitor <feature>`

Launch the monitoring dashboard to track feature development progress in real-time.

```bash
wiggum monitor <feature> [options]
```

**Options:**
| Flag | Description |
|------|-------------|
| `--interval <seconds>` | Refresh interval in seconds (default: 5) |
| `--bash` | Use bash script monitor instead of built-in |
| `--python` | Use Python TUI monitor (if available) |

**Examples:**
```bash
# Monitor with default settings
wiggum monitor user-authentication

# Monitor with faster refresh rate
wiggum monitor my-feature --interval 2

# Use bash monitor script
wiggum monitor my-feature --bash
```

---

### `wiggum new <feature>`

Create a new feature specification from template.

```bash
wiggum new <feature> [options]
```

**Options:**
| Flag | Description |
|------|-------------|
| `-e, --edit` | Open in editor after creation |
| `--editor <editor>` | Editor to use (defaults to `$EDITOR` or `code`) |
| `-y, --yes` | Skip confirmation prompts |
| `-f, --force` | Force overwrite if file exists |

**Examples:**
```bash
# Create a new spec with interactive prompts
wiggum new user-dashboard

# Create and open in VS Code
wiggum new user-dashboard --edit

# Create with vim, skip confirmations
wiggum new user-dashboard --edit --editor vim --yes

# Overwrite existing spec
wiggum new user-dashboard --force
```

## Generated Files Structure

After running `wiggum init`, the following structure is created:

```
.ralph/
├── ralph.config.js          # Main configuration file
├── prompts/                  # AI prompt templates
│   ├── PROMPT.md            # Implementation prompt
│   ├── PROMPT_feature.md    # Feature planning prompt
│   ├── PROMPT_e2e.md        # E2E testing prompt
│   ├── PROMPT_verify.md     # Verification prompt
│   └── PROMPT_review.md     # PR review prompt
├── scripts/                  # Automation scripts
│   ├── feature-loop.sh      # Main development loop
│   └── ralph-monitor.sh     # Monitoring script
├── specs/                    # Feature specifications
│   └── _example.md          # Example spec template
└── CLAUDE.md                # Project context for Claude
```

## Detection Capabilities

Wiggum automatically detects and configures support for:

### Core
- **Frameworks:** Next.js (App/Pages Router), React, Vue, Nuxt, Svelte, SvelteKit, Remix, Astro
- **Package Managers:** npm, yarn, pnpm, bun
- **Testing:** Jest, Vitest (unit), Playwright, Cypress (E2E)
- **Styling:** Tailwind CSS, CSS Modules, Styled Components, Emotion, Sass

### Data Layer
- **Databases:** PostgreSQL, MySQL, SQLite, MongoDB, Redis
- **ORMs:** Prisma, Drizzle, TypeORM, Mongoose, Kysely
- **APIs:** REST, GraphQL, tRPC, OpenAPI

### Frontend
- **State Management:** Zustand, Jotai, Redux, Pinia, Recoil, MobX, Valtio
- **UI Components:** shadcn/ui, Radix, Material UI, Chakra UI, Ant Design, Headless UI
- **Form Handling:** React Hook Form, Formik, Zod, Yup

### Services
- **Authentication:** NextAuth.js, Clerk, Auth0, Supabase Auth, Lucia, Better Auth
- **Analytics:** PostHog, Mixpanel, Amplitude, Google Analytics, Plausible
- **Payments:** Stripe, Paddle, LemonSqueezy
- **Email:** Resend, SendGrid, Postmark, Mailgun

### Infrastructure
- **Deployment:** Vercel, Netlify, Railway, Fly.io, Docker, AWS
- **Monorepos:** Turborepo, Nx, Lerna, pnpm workspaces

### MCP (Model Context Protocol)
- Detects existing MCP server configurations
- Identifies if project is an MCP server/client
- Recommends relevant MCP servers based on stack

## AI Enhancement

Wiggum uses a multi-agent AI system for deep project analysis:

```bash
wiggum init --provider anthropic
```

### Supported Providers

| Provider | Environment Variable |
|----------|---------------------|
| Anthropic | `ANTHROPIC_API_KEY` |
| OpenAI | `OPENAI_API_KEY` |
| OpenRouter | `OPENROUTER_API_KEY` |

### Optional Services

| Service | Environment Variable | Description |
|---------|---------------------|-------------|
| Tavily | `TAVILY_API_KEY` | Web search for current best practices |
| Context7 | `CONTEXT7_API_KEY` | Documentation lookup for your stack |

### AI Analysis Features

Wiggum's multi-agent system provides:
- **Codebase Analyst:** Explores project structure, entry points, and patterns
- **Stack Researcher:** Finds best practices, testing tools, and anti-patterns
- **Orchestrator:** Merges results and recommends MCP servers

## Configuration

### ralph.config.js

```javascript
export default {
  // Project paths
  paths: {
    root: '.ralph',
    specs: '.ralph/specs',
    prompts: '.ralph/prompts',
    scripts: '.ralph/scripts',
  },

  // Feature loop settings
  loop: {
    maxIterations: 10,
    maxE2eAttempts: 5,
    defaultModel: 'sonnet',
  },

  // AI settings
  ai: {
    provider: 'anthropic',
  },

  // Detected stack (auto-populated)
  stack: {
    framework: { name: 'Next.js', version: '14.0.0' },
    testing: {
      unit: { name: 'Vitest' },
      e2e: { name: 'Playwright' },
    },
    // ... other detected technologies
  },
};
```

## Requirements

- Node.js 18.0.0 or higher
- Git (for worktree features)
- Claude Code CLI (for running the development loop)

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `ANTHROPIC_API_KEY` | For AI features | Anthropic API key |
| `OPENAI_API_KEY` | For OpenAI provider | OpenAI API key |
| `OPENROUTER_API_KEY` | For OpenRouter provider | OpenRouter API key |
| `TAVILY_API_KEY` | Optional | Tavily API key for web search |
| `CONTEXT7_API_KEY` | Optional | Context7 API key for doc lookup |
| `EDITOR` | Optional | Default editor for `--edit` flag |
| `DEBUG` | Optional | Enable debug logging |

## Contributing

Contributions are welcome! Please read our contributing guidelines before submitting a pull request.

### Development Setup

```bash
# Clone the repository
git clone https://github.com/federiconeri/wiggum-cli.git
cd wiggum-cli

# Install dependencies
npm install

# Build the project
npm run build

# Run locally
node bin/ralph.js init
```

### Running Tests

```bash
# Type checking
npx tsc --noEmit

# Run tests (when available)
npm test
```

## License

MIT License - see [LICENSE](LICENSE) for details.

---

Built with Simpson Yellow (#FED90F) by the Wiggum team.
