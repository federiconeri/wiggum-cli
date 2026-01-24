import { createCli } from './cli.js';
import { createSessionState } from './repl/index.js';
import { hasConfig, loadConfigWithDefaults } from './utils/config.js';
import { getAvailableProvider } from './ai/providers.js';
import { notifyIfUpdateAvailable } from './utils/update-check.js';
import { renderApp } from './tui/app.js';
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
 * Called when wiggum is invoked with no arguments
 */
async function startInkTui(): Promise<void> {
  const projectRoot = process.cwd();
  const provider = getAvailableProvider();
  const version = getVersion();

  // Check if already initialized
  const isInitialized = hasConfig(projectRoot);
  let config = null;

  if (isInitialized) {
    config = await loadConfigWithDefaults(projectRoot);
  }

  // Create initial state (may not have config yet)
  const initialState = createSessionState(
    projectRoot,
    provider, // May be null if no API key
    'sonnet', // Default model, will be updated after /init
    undefined, // No scan result yet
    config,
    isInitialized
  );

  // Render Ink app
  const instance = renderApp({
    screen: 'welcome',
    initialSessionState: initialState,
    version,
    onComplete: (spec) => {
      // Spec generated - could save to file here
      console.log('\nSpec generated successfully!');
    },
    onExit: () => {
      instance.unmount();
      process.exit(0);
    },
  });

  // Wait for the app to exit
  await instance.waitUntilExit();
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
