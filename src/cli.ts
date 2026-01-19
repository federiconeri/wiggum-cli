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
    .name('ralph')
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
  $ ralph init                    Initialize Ralph in your project
  $ ralph init --ai               Initialize with AI-enhanced analysis
  $ ralph new my-feature          Create a new feature specification
  $ ralph run my-feature          Run the feature development loop
  $ ralph monitor my-feature      Monitor progress in real-time

Documentation:
  https://github.com/your-org/ralph-cli#readme
`
    );

  // ralph init
  program
    .command('init')
    .description(
      'Initialize Ralph in the current project.\n\n' +
        'Scans your codebase to detect the tech stack (framework, testing,\n' +
        'database, auth, etc.) and generates configuration files in .ralph/'
    )
    .option('--ai', 'Enable AI-enhanced analysis for deeper project insights')
    .option(
      '--provider <name>',
      'AI provider to use (anthropic, openai, openrouter)',
      'anthropic'
    )
    .option('-y, --yes', 'Accept defaults and skip all confirmation prompts')
    .addHelpText(
      'after',
      `
Examples:
  $ ralph init                           Basic initialization
  $ ralph init --ai                      With AI-enhanced analysis (Anthropic)
  $ ralph init --ai --provider openai    With OpenAI provider
  $ ralph init --yes                     Non-interactive mode

Environment Variables:
  ANTHROPIC_API_KEY    Required for --ai with anthropic provider
  OPENAI_API_KEY       Required for --ai with openai provider
  OPENROUTER_API_KEY   Required for --ai with openrouter provider
`
    )
    .action(async (options) => {
      try {
        await initCommand(options);
      } catch (error) {
        handleCommandError(error);
      }
    });

  // ralph run <feature>
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
  $ ralph run user-auth                     Run the user-auth feature
  $ ralph run payment --worktree            Run in isolated worktree
  $ ralph run payment --resume              Resume interrupted session
  $ ralph run my-feature --model opus       Use Claude Opus model
  $ ralph run my-feature --max-iterations 30 --max-e2e-attempts 5

Notes:
  - Create a feature spec first with: ralph new <feature>
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

  // ralph monitor <feature>
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
  $ ralph monitor my-feature              Monitor with built-in dashboard
  $ ralph monitor my-feature --interval 2 Refresh every 2 seconds
  $ ralph monitor my-feature --bash       Use bash script monitor

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

  // ralph new <feature>
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
    .addHelpText(
      'after',
      `
Examples:
  $ ralph new user-dashboard              Create spec with prompts
  $ ralph new user-dashboard --edit       Create and open in editor
  $ ralph new user-dashboard -e --editor vim  Open in vim
  $ ralph new user-dashboard --yes        Skip confirmations
  $ ralph new user-dashboard --force      Overwrite if exists

Output:
  Creates: .ralph/specs/<feature>.md

Template includes sections for:
  - Purpose and user stories
  - Functional and non-functional requirements
  - Technical notes and dependencies
  - Visual requirements (for UI features)
  - API endpoints
  - Acceptance criteria
`
    )
    .action(async (feature: string, options) => {
      try {
        const newOptions: NewOptions = {
          edit: options.edit,
          editor: options.editor,
          yes: options.yes,
          force: options.force,
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
