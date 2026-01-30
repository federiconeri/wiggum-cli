# Contributing to Wiggum CLI

We welcome contributions! This document explains how to help and what to expect.

## What we accept

### Always welcome
- **Bug fixes** — Found something broken? PRs welcome
- **Documentation** — Improvements, typos, examples, tutorials
- **Scanner detectors** — Add support for new frameworks, tools, or tech stacks
- **Templates** — New spec templates, prompt guides, or workflow examples

### Requires discussion first
- **New commands** — Open an issue before coding to align on scope
- **TUI components** — Discuss architecture impacts first
- **Integrations** — New API integrations need maintainer approval

## How to contribute

1. **Check existing issues** — Someone may already be working on it
2. **Open an issue first** — For anything beyond bug fixes, let's discuss before you code
3. **Wait for approval** — A maintainer will respond and give the go-ahead
4. **Keep PRs focused** — Small, single-purpose PRs are easier to review
5. **Add tests** — For bug fixes, include a test that would have caught it

## Development setup

```bash
# Clone the repo
git clone https://github.com/federiconeri/wiggum-cli.git
cd wiggum-cli

# Install dependencies
pnpm install

# Run in development mode
pnpm dev

# Run tests
pnpm test
```

## PR guidelines

- Reference the related issue in your PR description
- Keep commits atomic and well-described
- Ensure tests pass before submitting
- Be patient — reviews may take a few days depending on maintainer availability

## What we don't accept PRs for

- **Core AI/spec generation logic** — Maintained internally to ensure consistency
- **Paid features** — Dashboard, API infrastructure, and cloud features are developed separately
- **Large refactors without discussion** — These need alignment first

PRs in these areas without prior discussion will likely be closed.

## Found a security issue?

Please don't open a public issue. Email security concerns directly to the maintainers.

## Questions?

Open a [Discussion](https://github.com/federiconeri/wiggum-cli/discussions) for general questions, ideas, or feedback.

---

Thank you for contributing!
