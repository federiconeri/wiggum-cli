/**
 * Generator Orchestrator
 * Main entry point for generating ralph configuration files
 */

import { join } from 'node:path';
import type { ScanResult } from '../scanner/types.js';
import {
  extractVariables,
  processAllTemplates,
  getTemplatesDir,
  type TemplateVariables,
} from './templates.js';
import { generateConfig, generateConfigFile, type RalphConfig } from './config.js';
import {
  writeFiles,
  createDirectoryStructure,
  mapTemplateOutputPaths,
  formatWriteSummary,
  type WriteOptions,
  type WriteSummary,
  DEFAULT_WRITE_OPTIONS,
} from './writer.js';

// Re-export types and utilities
export type { TemplateVariables } from './templates.js';
export type { RalphConfig } from './config.js';
export type { WriteOptions, WriteSummary, WriteResult } from './writer.js';
export {
  extractVariables,
  processTemplate,
  processTemplateFile,
  getTemplatesDir,
} from './templates.js';
export { generateConfig, generateConfigFile } from './config.js';
export { writeFileWithOptions, formatWriteSummary, DEFAULT_WRITE_OPTIONS } from './writer.js';

/**
 * Options for the generator
 */
export interface GeneratorOptions {
  /** Custom variables to add/override */
  customVariables?: Record<string, string>;
  /** How to handle existing files */
  existingFiles?: 'backup' | 'skip' | 'overwrite';
  /** Whether to generate config file */
  generateConfig?: boolean;
  /** Verbose output */
  verbose?: boolean;
}

/**
 * Default generator options
 */
const DEFAULT_GENERATOR_OPTIONS: GeneratorOptions = {
  customVariables: {},
  existingFiles: 'backup',
  generateConfig: true,
  verbose: false,
};

/**
 * Result of generation
 */
export interface GenerationResult {
  /** Whether generation was successful */
  success: boolean;
  /** Template variables used */
  variables: TemplateVariables;
  /** Generated config */
  config?: RalphConfig;
  /** Write summary */
  writeSummary: WriteSummary;
  /** Errors encountered */
  errors: string[];
  /** Time taken in milliseconds */
  generationTime: number;
}

/**
 * Main Generator class
 */
export class Generator {
  private options: GeneratorOptions;

  constructor(options: GeneratorOptions = {}) {
    this.options = { ...DEFAULT_GENERATOR_OPTIONS, ...options };
  }

  /**
   * Generate all ralph files from scan result
   */
  async generate(scanResult: ScanResult): Promise<GenerationResult> {
    const startTime = Date.now();
    const errors: string[] = [];

    // Extract variables from scan result
    const variables = extractVariables(scanResult, this.options.customVariables || {});

    // Get templates directory
    const templatesDir = getTemplatesDir();

    // Process all templates
    let processedTemplates: Map<string, string>;
    try {
      processedTemplates = await processAllTemplates(templatesDir, variables);
    } catch (error) {
      errors.push(`Failed to process templates: ${error instanceof Error ? error.message : String(error)}`);
      return {
        success: false,
        variables,
        writeSummary: {
          total: 0,
          created: 0,
          backedUp: 0,
          skipped: 0,
          overwritten: 0,
          errors: 1,
          results: [],
        },
        errors,
        generationTime: Date.now() - startTime,
      };
    }

    // Generate config if requested
    let config: RalphConfig | undefined;
    if (this.options.generateConfig) {
      config = generateConfig(scanResult, this.options.customVariables || {});
      const configContent = generateConfigFile(config);
      processedTemplates.set('config/ralph.config.js', configContent);
    }

    // Map template outputs to final paths
    const mappedOutputs = mapTemplateOutputPaths(processedTemplates);

    // Create directory structure
    try {
      await createDirectoryStructure(scanResult.projectRoot);
    } catch (error) {
      errors.push(`Failed to create directory structure: ${error instanceof Error ? error.message : String(error)}`);
    }

    // Write all files
    const writeOptions: WriteOptions = {
      existingFiles: this.options.existingFiles || 'backup',
      createBackups: this.options.existingFiles === 'backup',
      verbose: this.options.verbose || false,
    };

    const writeSummary = await writeFiles(mappedOutputs, scanResult.projectRoot, writeOptions);

    // Add any write errors to errors list
    for (const result of writeSummary.results) {
      if (result.action === 'error' && result.error) {
        errors.push(`Failed to write ${result.path}: ${result.error}`);
      }
    }

    const generationTime = Date.now() - startTime;

    return {
      success: errors.length === 0,
      variables,
      config,
      writeSummary,
      errors,
      generationTime,
    };
  }
}

/**
 * Convenience function to generate ralph files
 */
export async function generateRalph(
  scanResult: ScanResult,
  options: GeneratorOptions = {}
): Promise<GenerationResult> {
  const generator = new Generator(options);
  return generator.generate(scanResult);
}

/**
 * Format generation result for display
 */
export function formatGenerationResult(result: GenerationResult): string {
  const lines: string[] = [];

  if (result.success) {
    lines.push('Generation completed successfully!');
  } else {
    lines.push('Generation completed with errors.');
  }

  lines.push(`Time: ${result.generationTime}ms`);
  lines.push('');

  // Show stack info
  lines.push('Detected Stack:');
  lines.push(`  Framework: ${result.variables.framework}${result.variables.frameworkVersion ? ' ' + result.variables.frameworkVersion : ''}`);
  lines.push(`  Package Manager: ${result.variables.packageManager}`);
  if (result.variables.unitTest !== 'none') {
    lines.push(`  Unit Testing: ${result.variables.unitTest}`);
  }
  if (result.variables.e2eTest !== 'none') {
    lines.push(`  E2E Testing: ${result.variables.e2eTest}`);
  }
  if (result.variables.styling !== 'css') {
    lines.push(`  Styling: ${result.variables.styling}`);
  }
  lines.push('');

  // Show write summary
  lines.push(formatWriteSummary(result.writeSummary));

  // Show errors
  if (result.errors.length > 0) {
    lines.push('');
    lines.push('Errors:');
    for (const error of result.errors) {
      lines.push(`  - ${error}`);
    }
  }

  return lines.join('\n');
}
