import { Command } from 'commander';
import { displayHeader } from './utils/header.js';
import { initCommand } from './commands/init.js';
import { runCommand, type RunOptions } from './commands/run.js';
import { monitorCommand, type MonitorOptions } from './commands/monitor.js';
import { newCommand, type NewOptions } from './commands/new.js';
import { logger } from './utils/logger.js';

/**
 * Set up and configure the CLI
 */
export function createCli(): Command {
  const program = new Command();

  program
    .name('wiggum')
    .description(
      'AI-powered feature development loop CLI.\n\n' +
        'Ralph auto-detects your tech stack and generates an intelligent\n' +
        'development environment for AI-driven feature implementation.'
    )
    .version('0.1.0')
    .hook('preAction', () => {
      displayHeader();
    })
    .addHelpText(
      'after',
      `
Examples:
  $ wiggum init                    Initialize Wiggum with AI analysis
  $ wiggum new my-feature          Create a new feature specification
  $ wiggum run my-feature          Run the feature development loop
  $ wiggum monitor my-feature      Monitor progress in real-time

Documentation:
  https://github.com/your-org/wiggum-cli#readme
`
    );

  // wiggum init
  program
    .command('init')
    .description(
      'Initialize Ralph in the current project.\n\n' +
        'Uses AI to analyze your codebase, detect the tech stack, and generate\n' +
        'intelligent configuration files in .ralph/'
    )
    .option(
      '--provider <name>',
      'AI provider to use (anthropic, openai, openrouter)',
      'anthropic'
    )
    .option('-y, --yes', 'Accept defaults and skip all confirmation prompts')
    .option('-i, --interactive', 'Stay in interactive REPL mode after initialization')
    .addHelpText(
      'after',
      `
Examples:
  $ wiggum init                           Initialize with AI analysis
  $ wiggum init --provider openai         Use OpenAI provider
  $ wiggum init --yes                     Non-interactive mode
  $ wiggum init -i                        Initialize and enter interactive mode

API Keys (BYOK - Bring Your Own Keys):
  Required (one of):
    ANTHROPIC_API_KEY    For Anthropic (Claude) provider
    OPENAI_API_KEY       For OpenAI provider
    OPENROUTER_API_KEY   For OpenRouter provider

  Optional (for enhanced research):
    TAVILY_API_KEY       Enable web search for best practices
    CONTEXT7_API_KEY     Enable documentation lookup
`
    )
    .action(async (options) => {
      try {
        await initCommand(options);
      } catch (error) {
        handleCommandError(error);
      }
    });

  // wiggum run <feature>
  program
    .command('run <feature>')
    .description(
      'Run the feature development loop for a specific feature.\n\n' +
        'Executes the AI-driven implementation workflow using the feature\n' +
        'spec in .ralph/specs/<feature>.md'
    )
    .option(
      '--worktree',
      'Use git worktree for isolation (enables parallel execution of multiple features)'
    )
    .option(
      '--resume',
      'Resume an interrupted loop (reuses existing branch and worktree)'
    )
    .option(
      '--model <model>',
      'Claude model to use for implementation (opus, sonnet)'
    )
    .option(
      '--max-iterations <n>',
      'Maximum number of implementation iterations (default: 50)',
      parseInt
    )
    .option(
      '--max-e2e-attempts <n>',
      'Maximum E2E test retry attempts before giving up (default: 3)',
      parseInt
    )
    .addHelpText(
      'after',
      `
Examples:
  $ wiggum run user-auth                     Run the user-auth feature
  $ wiggum run payment --worktree            Run in isolated worktree
  $ wiggum run payment --resume              Resume interrupted session
  $ wiggum run my-feature --model opus       Use Claude Opus model
  $ wiggum run my-feature --max-iterations 30 --max-e2e-attempts 5

Notes:
  - Create a feature spec first with: wiggum new <feature>
  - The spec file should be at: .ralph/specs/<feature>.md
  - Use --worktree to run multiple features in parallel
`
    )
    .action(async (feature: string, options) => {
      try {
        const runOptions: RunOptions = {
          worktree: options.worktree,
          resume: options.resume,
          model: options.model,
          maxIterations: options.maxIterations,
          maxE2eAttempts: options.maxE2eAttempts,
        };
        await runCommand(feature, runOptions);
      } catch (error) {
        handleCommandError(error);
      }
    });

  // wiggum monitor <feature>
  program
    .command('monitor <feature>')
    .description(
      'Launch the monitoring dashboard for a feature.\n\n' +
        'Displays real-time progress including iteration count, phase,\n' +
        'task completion, token usage, and E2E test status.'
    )
    .option(
      '--bash',
      'Use the bash script monitor instead of the built-in dashboard'
    )
    .option('--python', 'Use the Python TUI monitor (if available)')
    .option(
      '--interval <seconds>',
      'Dashboard refresh interval in seconds (default: 5)',
      parseInt,
      5
    )
    .addHelpText(
      'after',
      `
Examples:
  $ wiggum monitor my-feature              Monitor with built-in dashboard
  $ wiggum monitor my-feature --interval 2 Refresh every 2 seconds
  $ wiggum monitor my-feature --bash       Use bash script monitor

Dashboard Shows:
  - Current phase (Planning, Implementation, E2E Testing, etc.)
  - Iteration progress
  - Task completion status
  - Token usage (input/output)
  - Git branch information
`
    )
    .action(async (feature: string, options) => {
      try {
        const monitorOptions: MonitorOptions = {
          bash: options.bash,
          python: options.python,
          interval: options.interval,
        };
        await monitorCommand(feature, monitorOptions);
      } catch (error) {
        handleCommandError(error);
      }
    });

  // wiggum new <feature>
  program
    .command('new <feature>')
    .description(
      'Create a new feature specification from template.\n\n' +
        'Generates a markdown spec file with sections for requirements,\n' +
        'acceptance criteria, technical notes, and more.'
    )
    .option('-e, --edit', 'Open the spec in your editor after creation')
    .option(
      '--editor <editor>',
      'Editor command to use (defaults to $EDITOR or "code")'
    )
    .option('-y, --yes', 'Skip confirmation prompts')
    .option('-f, --force', 'Overwrite existing spec file without prompting')
    .option('--ai', 'Use AI interview to generate the spec')
    .option(
      '--provider <name>',
      'AI provider for spec generation (anthropic, openai, openrouter)'
    )
    .option('--model <model>', 'Model to use for AI spec generation')
    .addHelpText(
      'after',
      `
Examples:
  $ wiggum new user-dashboard              Create spec from template
  $ wiggum new user-dashboard --ai         Use AI interview to generate spec
  $ wiggum new user-dashboard --edit       Create and open in editor
  $ wiggum new user-dashboard -e --editor vim  Open in vim
  $ wiggum new user-dashboard --yes        Skip confirmations
  $ wiggum new user-dashboard --force      Overwrite if exists

Output:
  Creates: .ralph/specs/<feature>.md

AI Mode (--ai):
  - Gathers context from URLs/files you provide
  - Conducts an interview to understand your requirements
  - Generates a detailed, project-specific specification

Template Mode (default):
  - Uses a standard template with sections for:
    Purpose, user stories, requirements, technical notes, etc.
`
    )
    .action(async (feature: string, options) => {
      try {
        const newOptions: NewOptions = {
          edit: options.edit,
          editor: options.editor,
          yes: options.yes,
          force: options.force,
          ai: options.ai,
          provider: options.provider,
          model: options.model,
        };
        await newCommand(feature, newOptions);
      } catch (error) {
        handleCommandError(error);
      }
    });

  return program;
}

/**
 * Handle command errors with user-friendly output
 */
function handleCommandError(error: unknown): void {
  if (error instanceof Error) {
    logger.error(error.message);
    if (process.env.DEBUG) {
      console.error(error.stack);
    }
  } else {
    logger.error(String(error));
  }
  process.exit(1);
}
