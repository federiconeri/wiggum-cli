import { createSessionState } from './repl/session-state.js';
import { hasConfig, loadConfigWithDefaults } from './utils/config.js';
import { listSpecNames } from './utils/spec-names.js';
import { AVAILABLE_MODELS, getAvailableProvider, isAnthropicAlias } from './ai/providers.js';
import type { AIProvider } from './ai/providers.js';
import { notifyIfUpdateAvailable } from './utils/update-check.js';
import { renderApp, type AppScreen, type RunAppProps } from './tui/app.js';
import { logger } from './utils/logger.js';
import { loadApiKeysFromEnvLocal } from './utils/env.js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { runCommand, type RunOptions } from './commands/run.js';
import { monitorCommand, type MonitorOptions } from './commands/monitor.js';
import { handleConfigCommand } from './commands/config.js';
import { isCI } from './utils/ci.js';

/**
 * Parsed CLI arguments
 */
export interface ParsedArgs {
  command: string | undefined;
  positionalArgs: string[];
  flags: Record<string, string | boolean>;
}

/**
 * Normalize a flag name: strip '--' prefix and convert kebab-case to camelCase
 */
function normalizeFlagName(flag: string): string {
  return flag.replace(/^--/, '').replace(/-([a-z])/g, (_: string, c: string) => c.toUpperCase());
}

/**
 * Parse CLI arguments into command, positional args, and flags.
 * Supports: --flag value, --flag=value, boolean flags, short flags (-i, -y, -e, -f, -h, -v).
 */
export function parseCliArgs(argv: string[]): ParsedArgs {
  const positionalArgs: string[] = [];
  const flags: Record<string, string | boolean> = {};
  let command: string | undefined;

  const shortFlags: Record<string, string> = {
    '-i': 'interactive',
    '-y': 'yes',
    '-e': 'edit',
    '-f': 'force',
    '-h': 'help',
    '-v': 'version',
  };

  // Flags that consume the next argument as their value
  const valueFlagSet = new Set([
    '--model',
    '--max-iterations',
    '--max-e2e-attempts',
    '--interval',
    '--provider',
    '--review-mode',
  ]);

  let i = 0;
  while (i < argv.length) {
    const arg = argv[i];

    if (arg in shortFlags) {
      flags[shortFlags[arg]] = true;
      i++;
      continue;
    }

    if (arg.startsWith('--') && arg.includes('=')) {
      const eqIdx = arg.indexOf('=');
      const key = normalizeFlagName(arg.slice(0, eqIdx));
      const value = arg.slice(eqIdx + 1);
      flags[key] = value;
      i++;
      continue;
    }

    if (arg.startsWith('--')) {
      const normalized = normalizeFlagName(arg);
      if (valueFlagSet.has(arg) && i + 1 < argv.length && !argv[i + 1].startsWith('-')) {
        flags[normalized] = argv[i + 1];
        i += 2;
      } else {
        flags[normalized] = true;
        i++;
      }
      continue;
    }

    if (command === undefined) {
      command = arg;
    } else {
      positionalArgs.push(arg);
    }
    i++;
  }

  return { command, positionalArgs, flags };
}

function parseIntFlag(value: string, flagName: string): number {
  const n = parseInt(value, 10);
  if (Number.isNaN(n)) {
    console.error(`Error: ${flagName} must be a number, got "${value}"`);
    process.exit(1);
  }
  return n;
}

/**
 * Get version from package.json
 */
function getVersion(): string {
  try {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    const packagePath = join(__dirname, '..', 'package.json');
    const pkg = JSON.parse(readFileSync(packagePath, 'utf-8'));
    return pkg.version || '0.12.1';
  } catch (err) {
    logger.debug(`Failed to read version from package.json: ${err instanceof Error ? err.message : String(err)}`);
    return '0.12.1'; // Fallback version (keep in sync with app.tsx)
  }
}

/**
 * Start Ink TUI mode
 * Called when wiggum is invoked with no arguments or with screen-routing args
 */
async function startInkTui(
  initialScreen: AppScreen = 'shell',
  options?: { interviewFeature?: string; runFeature?: string; monitorOnly?: boolean },
): Promise<void> {
  const interviewFeature = options?.interviewFeature;
  const projectRoot = process.cwd();
  const version = getVersion();

  /**
   * Create session state based on current project state
   */
  async function createCurrentSessionState() {
    const provider = getAvailableProvider();
    const isInitialized = hasConfig(projectRoot);
    let config = null;

    if (isInitialized) {
      config = await loadConfigWithDefaults(projectRoot);
    }

    const getRecommendedModel = (p: AIProvider): string => {
      const models = AVAILABLE_MODELS[p];
      const recommended = models.find(m => m.hint?.includes('recommended'));
      return recommended?.value || models[0].value;
    };

    let model = provider ? getRecommendedModel(provider) : 'sonnet';
    const configuredModel = config?.loop?.defaultModel;
    if (configuredModel) {
      // Avoid applying Anthropic shorthand when using a non-Anthropic provider
      if (!(provider && provider !== 'anthropic' && isAnthropicAlias(configuredModel))) {
        model = configuredModel;
      }
    }

    const specsDir = config
      ? join(projectRoot, config.paths.specs)
      : join(projectRoot, '.ralph/specs');
    const specNames = await listSpecNames(specsDir);

    const state = createSessionState(
      projectRoot,
      provider, // May be null if no API key
      model,
      undefined, // No scan result yet
      config,
      isInitialized
    );
    return { ...state, specNames };
  }

  const initialState = await createCurrentSessionState();

  // Build interview props if starting on interview screen
  const interviewProps = interviewFeature && initialState.provider
    ? {
        featureName: interviewFeature,
        projectRoot,
        provider: initialState.provider,
        model: initialState.model,
        scanResult: initialState.scanResult,
      }
    : undefined;

  // Build run props if starting on run/monitor screen
  const runProps: RunAppProps | undefined = options?.runFeature
    ? { featureName: options.runFeature, monitorOnly: options.monitorOnly }
    : undefined;

  const instance = renderApp({
    screen: initialScreen,
    initialSessionState: initialState,
    version,
    interviewProps,
    runProps,
    onComplete: (specPath) => {
      // Spec was saved to disk by app.tsx (avoid stdout noise during TUI)
      logger.debug(`Created spec: ${specPath}`);
    },
    onExit: () => {
      instance.unmount();
      process.exit(0);
    },
  });

  await instance.waitUntilExit();
}

/**
 * Main entry point for the Wiggum CLI
 * TUI-first: routes args to appropriate TUI screens or CLI commands
 */
export async function main(): Promise<void> {
  // Load API keys from .ralph/.env.local before any provider detection
  loadApiKeysFromEnvLocal();

  const parsed = parseCliArgs(process.argv.slice(2));

  // Check for updates (non-blocking, fails silently)
  await notifyIfUpdateAvailable();

  // Handle --help / -h
  if (parsed.flags.help) {
    console.log(`
Wiggum CLI - AI-powered feature development assistant

Usage:
  wiggum                    Start interactive TUI
  wiggum init               Initialize project (TUI)
  wiggum new <name>         Create new feature spec (TUI)
  wiggum run <feature>      Run feature development loop
  wiggum monitor <feature>  Monitor a running feature loop
  wiggum config [args...]   Manage API keys and settings

Options for run:
  --worktree                Use git worktree isolation
  --resume                  Resume from last checkpoint
  --model <model>           AI model to use
  --max-iterations <n>      Maximum loop iterations
  --max-e2e-attempts <n>    Maximum E2E test attempts
  --review-mode <mode>      Review mode: manual, auto, merge

Options for monitor:
  --interval <seconds>      Refresh interval (default: 5)
  --bash                    Use bash monitor script
  --stream                  Force headless streaming output (skip TUI)

Options for init:
  --provider <name>         AI provider (anthropic, openai, openrouter)
  -i, --interactive         Interactive mode
  -y, --yes                 Accept all defaults

Options for new:
  --provider <name>         AI provider
  --model <model>           AI model
  -e, --edit                Open in editor after creation
  -f, --force               Overwrite existing spec

In the TUI:
  /init                     Initialize or reconfigure project
  /new <name>               Create a new feature specification
  /run <name>               Run the feature development loop
  /monitor <name>           Monitor a running feature loop
  /sync                     Sync context from git history
  /config [set <svc> <key>] Manage API keys and settings
  /help                     Show available commands
  /exit                     Exit the application

Press Esc to cancel any operation.
`);
    return;
  }

  // Handle --version / -v
  if (parsed.flags.version) {
    console.log(getVersion());
    return;
  }

  // No command = start with shell
  if (!parsed.command) {
    await startInkTui('shell');
    return;
  }

  switch (parsed.command) {
    case 'init': {
      // TODO: pass parsed flags to startInkTui once TUI supports init flags
      await startInkTui('init');
      break;
    }

    case 'new': {
      const featureName = parsed.positionalArgs[0];
      if (!featureName) {
        console.error('Error: <name> is required for "new"');
        console.error('Usage: wiggum new <name> [--provider <name>] [--model <model>] [-e] [-f]');
        process.exit(1);
      }
      // TODO: pass parsed flags to startInkTui once TUI supports new flags
      await startInkTui('interview', { interviewFeature: featureName });
      break;
    }

    case 'run': {
      const feature = parsed.positionalArgs[0];
      if (!feature) {
        console.error('Error: <feature> is required for "run"');
        console.error('Usage: wiggum run <feature> [--worktree] [--resume] [--model <model>] [--max-iterations <n>] [--max-e2e-attempts <n>]');
        process.exit(1);
      }
      const runOptions: RunOptions = {
        worktree: parsed.flags.worktree === true,
        resume: parsed.flags.resume === true,
        model: typeof parsed.flags.model === 'string' ? parsed.flags.model : undefined,
        maxIterations: typeof parsed.flags.maxIterations === 'string' ? parseIntFlag(parsed.flags.maxIterations, '--max-iterations') : undefined,
        maxE2eAttempts: typeof parsed.flags.maxE2eAttempts === 'string' ? parseIntFlag(parsed.flags.maxE2eAttempts, '--max-e2e-attempts') : undefined,
        reviewMode: typeof parsed.flags.reviewMode === 'string' ? parsed.flags.reviewMode as RunOptions['reviewMode'] : undefined,
      };
      await runCommand(feature, runOptions);
      break;
    }

    case 'monitor': {
      const feature = parsed.positionalArgs[0];
      if (!feature) {
        console.error('Error: <feature> is required for "monitor"');
        console.error('Usage: wiggum monitor <feature> [--interval <seconds>] [--bash] [--stream]');
        process.exit(1);
      }
      const interval = typeof parsed.flags.interval === 'string'
        ? parseIntFlag(parsed.flags.interval, '--interval')
        : undefined;

      // Routing order per spec:
      // 1. --bash → always use bash script path
      // 2. --stream → force headless streaming
      // 3. TTY and not CI → start Ink TUI in monitor-only mode
      // 4. default → headless streaming monitor
      if (parsed.flags.bash === true) {
        await monitorCommand(feature, { bash: true, interval });
      } else if (parsed.flags.stream === true) {
        await monitorCommand(feature, { interval });
      } else if (process.stdout.isTTY && !isCI()) {
        try {
          await startInkTui('run', { runFeature: feature, monitorOnly: true });
        } catch (err) {
          logger.error(`TUI failed to start: ${err instanceof Error ? err.message : String(err)}. Falling back to headless monitor.`);
          await monitorCommand(feature, { interval });
        }
      } else {
        await monitorCommand(feature, { interval });
      }
      break;
    }

    case 'config': {
      const provider = getAvailableProvider();
      const model = provider
        ? (AVAILABLE_MODELS[provider].find((m) => m.hint?.includes('recommended'))?.value ?? AVAILABLE_MODELS[provider][0].value)
        : 'sonnet';
      const state = createSessionState(process.cwd(), provider, model);
      await handleConfigCommand(parsed.positionalArgs, state);
      break;
    }

    default:
      // Unknown command - start TUI at shell
      logger.warn(`Unknown command: ${parsed.command}. Starting TUI...`);
      await startInkTui('shell');
  }
}

// Export for programmatic use
export { displayHeader } from './utils/header.js';
export { logger } from './utils/logger.js';

// Export scanner
export { Scanner, scanProject, formatScanResult } from './scanner/index.js';
export type {
  DetectionResult,
  DetectedStack,
  ScanResult,
  ScannerOptions,
} from './scanner/index.js';

// Export generator
export {
  Generator,
  generateRalph,
  formatGenerationResult,
  extractVariables,
  generateConfig,
  generateConfigFile,
} from './generator/index.js';
export type {
  GeneratorOptions,
  GenerationResult,
  TemplateVariables,
  RalphConfig,
  WriteOptions,
  WriteSummary,
} from './generator/index.js';

// Export TUI components for programmatic use
export { renderApp, type RenderAppOptions, type AppScreen } from './tui/app.js';
