import { createSessionState } from './repl/session-state.js';
import { hasConfig, loadConfigWithDefaults } from './utils/config.js';
import { AVAILABLE_MODELS, getAvailableProvider, isAnthropicAlias } from './ai/providers.js';
import type { AIProvider } from './ai/providers.js';
import { notifyIfUpdateAvailable } from './utils/update-check.js';
import { renderApp, type AppScreen } from './tui/app.js';
import { logger } from './utils/logger.js';
import { loadApiKeysFromEnvLocal } from './utils/env.js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

/**
 * Get version from package.json
 */
function getVersion(): string {
  try {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    const packagePath = join(__dirname, '..', 'package.json');
    const pkg = JSON.parse(readFileSync(packagePath, 'utf-8'));
    return pkg.version || '0.8.0';
  } catch {
    return '0.8.0';
  }
}

/**
 * Start Ink TUI mode
 * Called when wiggum is invoked with no arguments or with screen-routing args
 */
async function startInkTui(initialScreen: AppScreen = 'shell', interviewFeature?: string): Promise<void> {
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

    return createSessionState(
      projectRoot,
      provider, // May be null if no API key
      model,
      undefined, // No scan result yet
      config,
      isInitialized
    );
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

  const instance = renderApp({
    screen: initialScreen,
    initialSessionState: initialState,
    version,
    interviewProps,
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
 * TUI-first: routes args to appropriate TUI screens
 */
export async function main(): Promise<void> {
  // Load API keys from .ralph/.env.local before any provider detection
  loadApiKeysFromEnvLocal();

  const args = process.argv.slice(2);

  // Check for updates (non-blocking, fails silently)
  await notifyIfUpdateAvailable();

  // No args = start with shell
  if (args.length === 0) {
    await startInkTui('shell');
    return;
  }

  // Route commands to TUI screens
  const command = args[0];

  switch (command) {
    case 'init':
      // Start TUI at init screen
      await startInkTui('init');
      break;

    case 'new':
      // Start TUI at interview screen with feature name
      const featureName = args[1];
      if (!featureName) {
        logger.error('Feature name required. Usage: wiggum new <feature-name>');
        process.exit(1);
      }
      await startInkTui('interview', featureName);
      break;

    case '--help':
    case '-h':
      // Show help
      console.log(`
Wiggum CLI - AI-powered feature development assistant

Usage:
  wiggum              Start interactive TUI
  wiggum init         Initialize project (TUI)
  wiggum new <name>   Create new feature spec (TUI)

In the TUI:
  /init               Initialize or reconfigure project
  /new <name>         Create a new feature specification
  /help               Show available commands
  /exit               Exit the application

Press Esc to cancel any operation.
`);
      return;

    case '--version':
    case '-v':
      console.log(getVersion());
      return;

    default:
      // Unknown command - start TUI at shell
      logger.warn(`Unknown command: ${command}. Starting TUI...`);
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
