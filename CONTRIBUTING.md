# Contributing to Wiggum CLI

Thanks for your interest in contributing! This guide covers everything you need to get started.

## What We Accept

### Always welcome
- **Bug fixes** — Found something broken? PRs welcome
- **Documentation** — Improvements, typos, examples, tutorials
- **Scanner detectors** — Add support for new frameworks, tools, or tech stacks
- **Templates** — New spec templates, prompt guides, or workflow examples

### Requires discussion first
- **New commands** — Open an issue before coding to align on scope
- **TUI components** — Discuss architecture impacts first
- **Integrations** — New API integrations need maintainer approval
- **Large refactors** — These need alignment first

## Getting Started

```bash
git clone https://github.com/federiconeri/wiggum-cli.git
cd wiggum-cli
npm install
npm run build
```

### Prerequisites

- **Node.js** >= 18.0.0
- **npm**
- **Git**

## Development

### Build

```bash
npm run build        # Compile TypeScript + copy templates
npm run dev          # Watch mode (recompiles on save)
```

### Test

```bash
npm test             # Run all tests (vitest)
npm run test:watch   # Watch mode
```

### Run locally

```bash
npm start            # Runs bin/ralph.js
# or
node bin/ralph.js
```

## Project Structure

```
src/
├── ai/            # AI agents, conversation management, enhancers
├── commands/      # CLI command handlers (init, new, run, etc.)
├── context/       # Project context storage and conversion
├── generator/     # Template-based file generation
├── repl/          # REPL/interactive shell logic
├── scanner/       # Tech stack detection (80+ technologies)
├── templates/     # Templates for prompts, scripts, configs
├── terminal/      # Terminal utilities
├── tui/           # Ink-based terminal UI (screens, components, hooks)
├── utils/         # Shared utilities (config, env, tracing)
└── index.ts       # Entry point
```

Tests live next to source files as `*.test.ts`.

## Making Changes

### Branch naming

```
feat/short-description     # New features
fix/short-description      # Bug fixes
chore/short-description    # Maintenance, refactoring
docs/short-description     # Documentation
```

### Commit messages

We use [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add spec autocomplete to /run command
fix(tui): handle empty input in interview screen
chore: bump version to 0.11.19
docs: update CLI reference in README
```

**Format:** `type(scope): description`

| Type | When to use |
|------|------------|
| `feat` | New feature or capability |
| `fix` | Bug fix |
| `chore` | Maintenance, deps, version bumps |
| `docs` | Documentation only |
| `refactor` | Code change that neither fixes nor adds a feature |
| `test` | Adding or updating tests |

Common scopes: `tui`, `ai`, `cli`, `scanner`, `loop`.

## Pull Requests

1. Fork the repo and create your branch from `main`
2. Make your changes and add tests if applicable
3. Ensure `npm test` and `npm run build` pass
4. Write a clear PR title using the commit convention format
5. Reference the related issue in your PR description
6. Keep PRs small and focused — single-purpose PRs are easier to review

## Code Style

- **TypeScript** with strict mode enabled
- **ESM** modules (`import`/`export`, `.js` extensions in imports)
- **React JSX** for TUI components (Ink)
- Run `npm run build` to catch type errors before submitting

## Reporting Bugs

[Open an issue](https://github.com/federiconeri/wiggum-cli/issues/new) with:

- Steps to reproduce
- Expected vs actual behavior
- Node.js version (`node -v`)
- Wiggum version (`wiggum --version`)
- OS and terminal

## Feature Requests

[Open an issue](https://github.com/federiconeri/wiggum-cli/issues/new) describing:

- The problem you're trying to solve
- Your proposed solution
- Any alternatives you considered

## Out of Scope

We don't accept PRs for these areas without prior discussion:

- **Core AI logic** — Maintained internally to ensure consistency and quality
- **Paid features** — Dashboard, API infrastructure, cloud environment, and notification systems are developed separately
- **Large refactors without discussion** — These need alignment with the maintainer first

PRs in these areas without prior discussion will likely be closed.

## Security Issues

Please don't open a public issue. Email security concerns directly to the maintainers.

## License

By contributing, you agree that your contributions will be licensed under the project's [MIT + Commons Clause license](LICENSE).
