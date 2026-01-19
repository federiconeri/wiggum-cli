/**
 * Config Generator
 * Generates ralph.config.js file from scan results
 */

import type { ScanResult } from '../scanner/types.js';
import { extractVariables, type TemplateVariables } from './templates.js';

/**
 * Ralph configuration structure
 */
export interface RalphConfig {
  name: string;
  stack: {
    framework: {
      name: string;
      version: string;
      variant: string;
    };
    packageManager: string;
    testing: {
      unit: string;
      e2e: string;
    };
    styling: string;
  };
  commands: {
    dev: string;
    build: string;
    test: string;
    lint: string;
    typecheck: string;
  };
  paths: {
    root: string;
    prompts: string;
    guides: string;
    specs: string;
    scripts: string;
    learnings: string;
    agents: string;
  };
  loop: {
    maxIterations: number;
    maxE2eAttempts: number;
    defaultModel: string;
    planningModel: string;
  };
}

/**
 * Generate ralph config object from scan result
 */
export function generateConfig(scanResult: ScanResult, customVars: Record<string, string> = {}): RalphConfig {
  const vars = extractVariables(scanResult, customVars);

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
      defaultModel: 'sonnet',
      planningModel: 'opus',
    },
  };
}

/**
 * Generate ralph.config.js file content as JavaScript module
 */
export function generateConfigFile(config: RalphConfig): string {
  const content = `module.exports = ${JSON.stringify(config, null, 2)};
`;

  // Fix JSON to valid JS (unquote keys)
  return content
    .replace(/"(\w+)":/g, '$1:')
    .replace(/: "([^"]+)"/g, ": '$1'");
}

/**
 * Generate ralph.config.js from scan result
 */
export function generateConfigFileFromScan(scanResult: ScanResult, customVars: Record<string, string> = {}): string {
  const config = generateConfig(scanResult, customVars);
  return generateConfigFile(config);
}
