/**
 * Config Generator
 * Generates ralph.config.cjs file from scan results
 */

import type { ScanResult } from '../scanner/types.js';
import type { RalphConfig } from '../utils/config.js';
import { extractVariables, type TemplateVariables } from './templates.js';

/**
 * Generate ralph config object from scan result
 */
export function generateConfig(scanResult: ScanResult, customVars: Record<string, string> = {}): RalphConfig {
  const vars = extractVariables(scanResult, customVars);
  const defaultModel = customVars.defaultModel || 'sonnet';
  const planningModel = customVars.planningModel || 'opus';
  const codingCli = customVars.codingCli === 'codex' ? 'codex' : 'claude';
  const reviewCli = customVars.reviewCli === 'codex' ? 'codex' : codingCli;
  const agentProvider = customVars.agentProvider || 'anthropic';
  const agentModel = customVars.agentModel || 'claude-sonnet-4-6';

  return {
    name: vars.projectName,
    stack: {
      framework: {
        name: vars.framework,
        version: vars.frameworkVersion,
        variant: vars.frameworkVariant,
      },
      packageManager: vars.packageManager,
      testing: {
        unit: vars.unitTest,
        e2e: vars.e2eTest,
      },
      styling: vars.styling,
    },
    commands: {
      dev: vars.devCommand,
      build: vars.buildCommand,
      test: vars.testCommand,
      lint: vars.lintCommand,
      typecheck: vars.typecheckCommand,
    },
    paths: {
      root: '.ralph',
      prompts: '.ralph/prompts',
      guides: '.ralph/guides',
      specs: '.ralph/specs',
      scripts: '.ralph/scripts',
      learnings: '.ralph/LEARNINGS.md',
      agents: '.ralph/AGENTS.md',
    },
    loop: {
      maxIterations: 10,
      maxE2eAttempts: 5,
      defaultModel,
      planningModel,
      codingCli,
      reviewCli,
      reviewMode: 'manual',
    },
    agent: {
      defaultProvider: agentProvider,
      defaultModel: agentModel,
    },
  };
}

/**
 * Generate ralph.config.cjs file content as CommonJS module
 */
export function generateConfigFile(config: RalphConfig): string {
  // Use CommonJS module.exports for compatibility with both CJS and ESM projects
  // ESM projects can import CJS modules, but CJS projects can't use 'export default'
  const content = `module.exports = ${JSON.stringify(config, null, 2)};
`;

  // Fix JSON to valid JS (unquote keys)
  return content
    .replace(/"(\w+)":/g, '$1:')
    .replace(/: "([^"]+)"/g, ": '$1'");
}

/**
 * Generate ralph.config.cjs from scan result
 */
export function generateConfigFileFromScan(scanResult: ScanResult, customVars: Record<string, string> = {}): string {
  const config = generateConfig(scanResult, customVars);
  return generateConfigFile(config);
}
