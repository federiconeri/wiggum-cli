/**
 * Template Processing System
 * Reads template files with {{variable}} placeholders and substitutes values
 */

import { readFile, readdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ScanResult, DetectedStack } from '../scanner/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Template variables available for substitution
 */
export interface TemplateVariables {
  // Project info
  projectName: string;
  projectRoot: string;

  // Framework info
  framework: string;
  frameworkVersion: string;
  frameworkVariant: string;

  // Package manager
  packageManager: string;
  packageManagerVersion: string;

  // Testing
  unitTest: string;
  unitTestVersion: string;
  e2eTest: string;
  e2eTestVersion: string;

  // Styling
  styling: string;
  stylingVersion: string;
  stylingVariant: string;

  // Commands (derived from package manager or AI detected)
  devCommand: string;
  buildCommand: string;
  testCommand: string;
  lintCommand: string;
  typecheckCommand: string;
  formatCommand: string;

  // Paths
  appDir: string;

  // AI Analysis (optional - populated when AI enhancement is used)
  aiEntryPoints: string;
  aiKeyDirectories: string;
  aiNamingConventions: string;
  aiImplementationGuidelines: string;
  aiMcpEssential: string;
  aiMcpRecommended: string;
  aiMissedTechnologies: string;
  hasAiAnalysis: string;

  // Custom variables
  [key: string]: string;
}

/**
 * Default template variables
 */
const DEFAULT_VARIABLES: Partial<TemplateVariables> = {
  framework: 'unknown',
  frameworkVersion: '',
  frameworkVariant: '',
  packageManager: 'npm',
  packageManagerVersion: '',
  unitTest: 'none',
  unitTestVersion: '',
  e2eTest: 'none',
  e2eTestVersion: '',
  styling: 'css',
  stylingVersion: '',
  stylingVariant: '',
  appDir: '.',
};

/**
 * Derive commands from package manager
 */
function deriveCommands(packageManager: string): Pick<
  TemplateVariables,
  'devCommand' | 'buildCommand' | 'testCommand' | 'lintCommand' | 'typecheckCommand' | 'formatCommand'
> {
  const pm = packageManager.toLowerCase();
  const run = pm === 'npm' ? 'npm run' : pm;

  return {
    devCommand: `${run} dev`,
    buildCommand: `${run} build`,
    testCommand: pm === 'npm' ? 'npm test' : `${pm} test`,
    lintCommand: `${run} lint`,
    typecheckCommand: pm === 'npm' ? 'npx tsc --noEmit' : `${pm} tsc --noEmit`,
    formatCommand: pm === 'npm' ? 'npx prettier --write .' : `${pm} prettier --write .`,
  };
}

/**
 * AI analysis template variables
 */
type AiTemplateVars = Pick<TemplateVariables,
  'hasAiAnalysis' | 'aiEntryPoints' | 'aiKeyDirectories' | 'aiNamingConventions' |
  'aiImplementationGuidelines' | 'aiMcpEssential' | 'aiMcpRecommended' | 'aiMissedTechnologies'
>;

/**
 * Format AI analysis data for templates
 */
function formatAiAnalysisForTemplates(scanResult: ScanResult): AiTemplateVars {
  // Check if this is an EnhancedScanResult with aiAnalysis
  const aiAnalysis = (scanResult as { aiAnalysis?: {
    projectContext?: {
      entryPoints?: string[];
      keyDirectories?: Record<string, string>;
      namingConventions?: string;
    };
    commands?: Record<string, string>;
    implementationGuidelines?: string[];
    mcpServers?: {
      essential?: string[];
      recommended?: string[];
    };
    possibleMissedTechnologies?: string[];
  } }).aiAnalysis;

  if (!aiAnalysis) {
    return {
      hasAiAnalysis: '',
      aiEntryPoints: '',
      aiKeyDirectories: '',
      aiNamingConventions: '',
      aiImplementationGuidelines: '',
      aiMcpEssential: '',
      aiMcpRecommended: '',
      aiMissedTechnologies: '',
    };
  }

  // Format entry points as bullet list
  const entryPoints = aiAnalysis.projectContext?.entryPoints || [];
  const aiEntryPoints = entryPoints.length > 0
    ? entryPoints.map(e => `- \`${e}\``).join('\n')
    : '';

  // Format key directories as table rows
  const keyDirs = aiAnalysis.projectContext?.keyDirectories || {};
  const aiKeyDirectories = Object.keys(keyDirs).length > 0
    ? Object.entries(keyDirs).map(([dir, purpose]) => `| \`${dir}/\` | ${purpose} |`).join('\n')
    : '';

  // Naming conventions
  const aiNamingConventions = aiAnalysis.projectContext?.namingConventions || '';

  // Implementation guidelines as bullet list
  const guidelines = aiAnalysis.implementationGuidelines || [];
  const aiImplementationGuidelines = guidelines.length > 0
    ? guidelines.map(g => `- ${g}`).join('\n')
    : '';

  // MCP servers
  const aiMcpEssential = (aiAnalysis.mcpServers?.essential || []).join(', ');
  const aiMcpRecommended = (aiAnalysis.mcpServers?.recommended || []).join(', ');

  // Missed technologies
  const aiMissedTechnologies = (aiAnalysis.possibleMissedTechnologies || []).join(', ');

  return {
    hasAiAnalysis: 'true',
    aiEntryPoints,
    aiKeyDirectories,
    aiNamingConventions,
    aiImplementationGuidelines,
    aiMcpEssential,
    aiMcpRecommended,
    aiMissedTechnologies,
  };
}

/**
 * Extract AI-detected commands or fall back to derived commands
 */
function getCommands(
  scanResult: ScanResult,
  packageManager: string
): Pick<TemplateVariables, 'devCommand' | 'buildCommand' | 'testCommand' | 'lintCommand' | 'typecheckCommand' | 'formatCommand'> {
  // Check for AI-detected commands
  const aiCommands = (scanResult as { aiAnalysis?: { commands?: Record<string, string> } }).aiAnalysis?.commands;

  // Derive default commands from package manager
  const derived = deriveCommands(packageManager);

  if (!aiCommands) {
    return derived;
  }

  // Use AI-detected commands where available, fall back to derived
  return {
    devCommand: aiCommands.dev || derived.devCommand,
    buildCommand: aiCommands.build || derived.buildCommand,
    testCommand: aiCommands.test || derived.testCommand,
    lintCommand: aiCommands.lint || derived.lintCommand,
    typecheckCommand: aiCommands.typecheck || derived.typecheckCommand,
    formatCommand: aiCommands.format || derived.formatCommand,
  };
}

/**
 * Extract template variables from scan result
 */
export function extractVariables(scanResult: ScanResult, customVars: Record<string, string> = {}): TemplateVariables {
  const { stack, projectRoot } = scanResult;

  // Extract project name from path
  const projectName = projectRoot.split('/').pop() || 'project';

  // Extract framework info
  const framework = stack.framework?.name || DEFAULT_VARIABLES.framework!;
  const frameworkVersion = stack.framework?.version || DEFAULT_VARIABLES.frameworkVersion!;
  const frameworkVariant = stack.framework?.variant || DEFAULT_VARIABLES.frameworkVariant!;

  // Extract package manager info
  const packageManager = stack.packageManager?.name || DEFAULT_VARIABLES.packageManager!;
  const packageManagerVersion = stack.packageManager?.version || DEFAULT_VARIABLES.packageManagerVersion!;

  // Extract testing info
  const unitTest = stack.testing?.unit?.name || DEFAULT_VARIABLES.unitTest!;
  const unitTestVersion = stack.testing?.unit?.version || DEFAULT_VARIABLES.unitTestVersion!;
  const e2eTest = stack.testing?.e2e?.name || DEFAULT_VARIABLES.e2eTest!;
  const e2eTestVersion = stack.testing?.e2e?.version || DEFAULT_VARIABLES.e2eTestVersion!;

  // Extract styling info
  const styling = stack.styling?.name || DEFAULT_VARIABLES.styling!;
  const stylingVersion = stack.styling?.version || DEFAULT_VARIABLES.stylingVersion!;
  const stylingVariant = stack.styling?.variant || DEFAULT_VARIABLES.stylingVariant!;

  // Get commands (AI-detected or derived)
  const commands = getCommands(scanResult, packageManager);

  // Extract AI analysis data
  const aiData = formatAiAnalysisForTemplates(scanResult);

  // Determine app directory
  let appDir = '.'; // Default to project root

  if (frameworkVariant === 'app-router') {
    appDir = 'app';
  } else if (
    existsSync(join(projectRoot, 'src', 'index.ts')) ||
    existsSync(join(projectRoot, 'src', 'index.tsx')) ||
    existsSync(join(projectRoot, 'src', 'main.ts'))
  ) {
    appDir = 'src';
  }

  return {
    projectName,
    projectRoot,
    framework,
    frameworkVersion,
    frameworkVariant,
    packageManager,
    packageManagerVersion,
    unitTest,
    unitTestVersion,
    e2eTest,
    e2eTestVersion,
    styling,
    stylingVersion,
    stylingVariant,
    appDir,
    ...commands,
    ...aiData,
    ...customVars,
  };
}

/**
 * Check if a value is considered "truthy" for template conditionals
 */
function isTruthyValue(value: string | undefined): boolean {
  return Boolean(value && value !== 'none' && value !== 'unknown' && value !== '');
}

/**
 * Find matching closing tag for nested blocks
 * Returns the index of the matching {{/tag}} or -1 if not found
 */
function findMatchingClose(content: string, openTag: string, closeTag: string, startIndex: number = 0): number {
  let depth = 1;
  let i = startIndex;

  while (i < content.length && depth > 0) {
    const openMatch = content.indexOf(openTag, i);
    const closeMatch = content.indexOf(closeTag, i);

    if (closeMatch === -1) {
      return -1; // No more closing tags
    }

    if (openMatch !== -1 && openMatch < closeMatch) {
      // Found another opening tag before the closing tag
      depth++;
      i = openMatch + openTag.length;
    } else {
      // Found a closing tag
      depth--;
      if (depth === 0) {
        return closeMatch;
      }
      i = closeMatch + closeTag.length;
    }
  }

  return -1;
}

/**
 * Process a single if block (handles nesting via recursion)
 */
function processIfBlock(
  template: string,
  variables: TemplateVariables,
  startIndex: number,
  varName: string
): { result: string; endIndex: number } {
  const openTagEnd = template.indexOf('}}', startIndex) + 2;
  const closeTag = '{{/if}}';

  // Find the matching close tag (handling nesting)
  let searchStart = openTagEnd;
  let closeIndex = findMatchingClose(template, '{{#if', closeTag, searchStart);

  if (closeIndex === -1) {
    // No matching close, return as-is
    return { result: template.slice(startIndex, openTagEnd), endIndex: openTagEnd };
  }

  const innerContent = template.slice(openTagEnd, closeIndex);

  // Check for else clause (not inside nested if)
  let elseIndex = -1;
  let depth = 0;
  for (let i = 0; i < innerContent.length; i++) {
    if (innerContent.slice(i, i + 5) === '{{#if') {
      depth++;
    } else if (innerContent.slice(i, i + 7) === '{{/if}}') {
      depth--;
    } else if (depth === 0 && innerContent.slice(i, i + 8) === '{{else}}') {
      elseIndex = i;
      break;
    }
  }

  const value = variables[varName as keyof TemplateVariables];
  const isTruthy = isTruthyValue(value);

  let selectedContent: string;
  if (elseIndex !== -1) {
    const ifPart = innerContent.slice(0, elseIndex);
    const elsePart = innerContent.slice(elseIndex + 8);
    selectedContent = isTruthy ? ifPart : elsePart;
  } else {
    selectedContent = isTruthy ? innerContent : '';
  }

  return { result: selectedContent, endIndex: closeIndex + closeTag.length };
}

/**
 * Process conditional blocks in template
 * Supports: {{#if variable}}...{{/if}} and {{#if variable}}...{{else}}...{{/if}}
 * Handles nested conditionals correctly
 */
function processConditionals(template: string, variables: TemplateVariables): string {
  let result = '';
  let i = 0;

  while (i < template.length) {
    // Look for {{#if
    const ifMatch = template.slice(i).match(/^\{\{#if\s+(\w+)\}\}/);
    if (ifMatch) {
      const varName = ifMatch[1];
      const { result: blockResult, endIndex } = processIfBlock(template, variables, i, varName);
      // Recursively process the content for nested conditionals
      result += processConditionals(blockResult, variables);
      i += endIndex - i;
      continue;
    }

    // Look for {{#unless
    const unlessMatch = template.slice(i).match(/^\{\{#unless\s+(\w+)\}\}/);
    if (unlessMatch) {
      const varName = unlessMatch[1];
      const openTagEnd = i + unlessMatch[0].length;
      const closeTag = '{{/unless}}';
      const closeIndex = template.indexOf(closeTag, openTagEnd);

      if (closeIndex !== -1) {
        const innerContent = template.slice(openTagEnd, closeIndex);
        const value = variables[varName as keyof TemplateVariables];
        const isTruthy = isTruthyValue(value);

        if (!isTruthy) {
          result += processConditionals(innerContent, variables);
        }
        i = closeIndex + closeTag.length;
        continue;
      }
    }

    // Regular character, copy it
    result += template[i];
    i++;
  }

  return result;
}

/**
 * Process variable substitution in template
 * Supports: {{variable}} and {{variable || default}}
 */
function processVariables(template: string, variables: TemplateVariables): string {
  // Process variables with defaults
  const defaultRegex = /\{\{(\w+)\s*\|\|\s*([^}]+)\}\}/g;
  let result = template.replace(defaultRegex, (_, varName, defaultValue) => {
    const value = variables[varName as keyof TemplateVariables];
    return value && value !== '' ? value : defaultValue.trim();
  });

  // Process simple variables
  const varRegex = /\{\{(\w+)\}\}/g;
  result = result.replace(varRegex, (_, varName) => {
    const value = variables[varName as keyof TemplateVariables];
    return value !== undefined ? value : '';
  });

  return result;
}

/**
 * Process a template string with variable substitution
 */
export function processTemplate(template: string, variables: TemplateVariables): string {
  // First process conditionals
  let result = processConditionals(template, variables);

  // Then substitute variables
  result = processVariables(result, variables);

  // Clean up multiple blank lines
  result = result.replace(/\n{3,}/g, '\n\n');

  return result;
}

/**
 * Read and process a template file
 */
export async function processTemplateFile(templatePath: string, variables: TemplateVariables): Promise<string> {
  const template = await readFile(templatePath, 'utf-8');
  return processTemplate(template, variables);
}

/**
 * Get the templates directory path
 */
export function getTemplatesDir(): string {
  // In development (src), templates are at src/templates
  // In production (dist), templates are at dist/templates
  const srcTemplates = join(__dirname, '..', 'templates');
  return srcTemplates;
}

/**
 * Template file info
 */
export interface TemplateFile {
  /** Source template path */
  sourcePath: string;
  /** Relative path from templates directory */
  relativePath: string;
  /** Output path (without .tmpl extension) */
  outputPath: string;
  /** Category (prompts, guides, specs, config) */
  category: string;
}

/**
 * Discover all template files
 */
export async function discoverTemplates(templatesDir: string): Promise<TemplateFile[]> {
  const templates: TemplateFile[] = [];

  async function scanDir(dir: string, category: string = ''): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = join(dir, entry.name);

      if (entry.isDirectory()) {
        await scanDir(fullPath, entry.name);
      } else if (entry.name.endsWith('.tmpl')) {
        const relativePath = fullPath.slice(templatesDir.length + 1);
        const outputPath = relativePath.replace(/\.tmpl$/, '');

        templates.push({
          sourcePath: fullPath,
          relativePath,
          outputPath,
          category,
        });
      }
    }
  }

  await scanDir(templatesDir);
  return templates;
}

/**
 * Process all templates and return their contents
 */
export async function processAllTemplates(
  templatesDir: string,
  variables: TemplateVariables
): Promise<Map<string, string>> {
  const templates = await discoverTemplates(templatesDir);
  const processed = new Map<string, string>();

  for (const template of templates) {
    const content = await processTemplateFile(template.sourcePath, variables);
    processed.set(template.outputPath, content);
  }

  return processed;
}
