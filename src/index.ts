import { createCli } from './cli.js';
import { startRepl, createSessionState } from './repl/index.js';
import { hasConfig, loadConfigWithDefaults } from './utils/config.js';
import { getAvailableProvider } from './ai/providers.js';
import { displayHeader } from './utils/header.js';

/**
 * Start REPL-first mode
 * Called when wiggum is invoked with no arguments
 */
async function startReplFirst(): Promise<void> {
  const projectRoot = process.cwd();
  const provider = getAvailableProvider();

  // Display header
  displayHeader();

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

  await startRepl(initialState);
}

/**
 * Main entry point for the Ralph CLI
 * REPL-first: no args = start REPL, otherwise use CLI
 */
export async function main(): Promise<void> {
  const args = process.argv.slice(2);

  // REPL-first: no args = start REPL
  if (args.length === 0) {
    await startReplFirst();
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
