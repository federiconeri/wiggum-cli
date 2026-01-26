import { createCli } from './cli.js';
import { createSessionState } from './repl/index.js';
import { hasConfig, loadConfigWithDefaults } from './utils/config.js';
import { getAvailableProvider } from './ai/providers.js';
import { notifyIfUpdateAvailable } from './utils/update-check.js';
import { renderApp } from './tui/app.js';
import { runInitWorkflow } from './commands/init.js';
import { logger } from './utils/logger.js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import type { Instance } from 'ink';

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
 * Called when wiggum is invoked with no arguments
 */
async function startInkTui(): Promise<void> {
  const projectRoot = process.cwd();
  const version = getVersion();

  // Track current Ink instance for init workflow
  let instance: Instance | null = null;
  let shouldRestart = false;

  /**
   * Ensure stdin is active for readline-based prompts after Ink unmount
   */
  const resetStdinForReadline = () => {
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(false);
    }
    process.stdin.resume();
    if (typeof process.stdin.ref === 'function') {
      process.stdin.ref();
    }
  };

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

    return createSessionState(
      projectRoot,
      provider, // May be null if no API key
      'sonnet', // Default model, will be updated after /init
      undefined, // No scan result yet
      config,
      isInitialized
    );
  }

  /**
   * Render the TUI app
   */
  async function renderTui(screen: 'welcome' | 'shell' = 'welcome') {
    const initialState = await createCurrentSessionState();

    instance = renderApp({
      screen,
      initialSessionState: initialState,
      version,
      onComplete: (specPath) => {
        // Spec was saved to disk by app.tsx
        logger.success(`Created spec: ${specPath}`);
      },
      onExit: () => {
        instance?.unmount();
        if (!shouldRestart) {
          process.exit(0);
        }
      },
      onRunInit: async () => {
        // Unmount Ink to run init workflow with readline prompts
        shouldRestart = true;
        const currentInstance = instance;
        currentInstance?.unmount();
        // Keep stdin alive for readline prompts before awaiting
        resetStdinForReadline();
        // Wait for Ink to fully clean up stdin handlers
        if (currentInstance?.waitUntilExit) {
          await currentInstance.waitUntilExit();
        }
        // Reset stdin again after Ink cleanup
        resetStdinForReadline();

        // Clear screen for init workflow
        console.clear();

        try {
          const result = await runInitWorkflow(projectRoot, {});

          if (result) {
            logger.success('Initialization complete!');
            console.log('');
          } else {
            logger.info('Initialization cancelled');
            console.log('');
          }
        } catch (error) {
          logger.error(`Init failed: ${error instanceof Error ? error.message : String(error)}`);
          console.log('');
        }

        // Re-render TUI with updated state
        shouldRestart = false;
        await renderTui('shell');
      },
    });

    await instance.waitUntilExit();
  }

  // Start with welcome screen
  await renderTui('welcome');
}

/**
 * Main entry point for the Wiggum CLI
 * TUI-first: no args = start Ink TUI, otherwise use CLI
 */
export async function main(): Promise<void> {
  const args = process.argv.slice(2);

  // Check for updates (non-blocking, fails silently)
  await notifyIfUpdateAvailable();

  // TUI-first: no args = start Ink TUI
  if (args.length === 0) {
    await startInkTui();
    return;
  }

  // Legacy CLI mode for backward compatibility
  const program = createCli();
  await program.parseAsync(process.argv);
}

// Export for programmatic use
export { createCli } from './cli.js';
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
