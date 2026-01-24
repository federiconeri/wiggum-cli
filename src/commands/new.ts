/**
 * New Command
 * Create a new feature specification from template or AI interview
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { logger } from '../utils/logger.js';
import { loadConfigWithDefaults, hasConfig } from '../utils/config.js';
import { getAvailableProvider, type AIProvider, AVAILABLE_MODELS } from '../ai/providers.js';
import { SpecGenerator } from '../ai/conversation/index.js';
import { Scanner, type ScanResult } from '../scanner/index.js';
import { flushTracing, traced, initTracing } from '../utils/tracing.js';
import pc from 'picocolors';
import * as prompts from '@clack/prompts';
import { renderApp } from '../tui/app.js';
import { createSessionState } from '../repl/session-state.js';

export interface NewOptions {
  /** Open in editor after creation */
  edit?: boolean;
  /** Editor to use (defaults to $EDITOR or 'code') */
  editor?: string;
  /** Skip confirmation */
  yes?: boolean;
  /** Force overwrite if file exists */
  force?: boolean;
  /** Use AI interview to generate spec */
  ai?: boolean;
  /** Use Ink TUI for AI interview (instead of readline) */
  tui?: boolean;
  /** AI provider (anthropic, openai, openrouter) */
  provider?: AIProvider;
  /** Model to use for AI generation */
  model?: string;
  /** Pre-loaded scan result (from REPL session) */
  scanResult?: ScanResult;
}

/**
 * Default spec template content
 */
const DEFAULT_SPEC_TEMPLATE = `# {{feature}} Feature Specification

**Status:** Planned
**Version:** 1.0
**Last Updated:** {{date}}

## Purpose

Describe what this feature does and why it's needed.

## User Stories

- As a user, I want [action] so that [benefit]
- As an admin, I want [action] so that [benefit]

## Requirements

### Functional Requirements
- [ ] Requirement 1 - Description of what the system must do
- [ ] Requirement 2 - Another functional requirement

### Non-Functional Requirements
- [ ] Performance: [target metrics]
- [ ] Security: [security considerations]
- [ ] Accessibility: [WCAG level]

## Technical Notes

- **Uses:** Existing patterns or components to leverage
- **Location:** Where the code should live
- **Dependencies:** External libraries or APIs needed
- **Database:** Schema changes required (if any)

## Visual Requirements

(For UI features - delete this section if backend-only)

- **Layout:** Describe the layout structure and responsive behavior
- **Components:** List the UI components needed
- **States:**
  - Empty: What to show when there's no data
  - Loading: Skeleton or spinner pattern
  - Error: How to display errors
- **Mobile:** How the layout adapts on small screens

## API Endpoints

(If applicable)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | \`/api/{{feature}}\` | Fetch data |
| POST | \`/api/{{feature}}\` | Create new |

## Acceptance Criteria

- [ ] Criteria 1 - Specific, testable condition
- [ ] Criteria 2 - Another acceptance criterion
- [ ] Criteria 3 - E2E testable scenario

## Out of Scope

- Feature X (planned for future iteration)
- Integration Y (separate spec)

## Open Questions

- [ ] Question 1 - Decision needed
- [ ] Question 2 - Clarification required
`;

/**
 * Get default model for a provider
 */
function getDefaultModelForProvider(provider: AIProvider): string {
  const models = AVAILABLE_MODELS[provider];
  const recommended = models.find(m => m.hint?.includes('recommended'));
  return recommended?.value || models[0].value;
}

/**
 * Find the _example.md template
 */
async function findExampleTemplate(projectRoot: string): Promise<string | null> {
  const config = await loadConfigWithDefaults(projectRoot);
  const specsDir = config.paths.specs;

  // Check multiple locations
  const possiblePaths = [
    join(projectRoot, specsDir, '_example.md'),
    join(projectRoot, '.ralph', 'specs', '_example.md'),
    join(projectRoot, 'specs', '_example.md'),
  ];

  for (const templatePath of possiblePaths) {
    if (existsSync(templatePath)) {
      return templatePath;
    }
  }

  return null;
}

/**
 * Get template directory from the package
 */
function getPackageTemplateDir(): string {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  // Go up from commands/ to src/ or dist/, then to templates/
  return join(__dirname, '..', 'templates', 'specs');
}

/**
 * Process template variables
 */
function processTemplate(template: string, feature: string): string {
  const date = new Date().toISOString().split('T')[0];
  const featureTitle = feature
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');

  return template
    .replace(/\{\{feature\}\}/g, feature)
    .replace(/\{\{featureTitle\}\}/g, featureTitle)
    .replace(/\{\{date\}\}/g, date)
    .replace(/YYYY-MM-DD/g, date);
}

/**
 * Open file in editor
 */
function openInEditor(filePath: string, editor?: string): void {
  const editorCmd = editor || process.env.EDITOR || 'code';

  logger.info(`Opening in editor: ${editorCmd}`);

  const child = spawn(editorCmd, [filePath], {
    detached: true,
    stdio: 'ignore',
  });

  child.unref();
}

/**
 * Create a new feature specification
 */
export async function newCommand(feature: string, options: NewOptions = {}): Promise<void> {
  const projectRoot = process.cwd();

  // Validate feature name
  if (!feature || typeof feature !== 'string') {
    logger.error('Feature name is required');
    process.exit(1);
  }

  // Sanitize feature name (allow alphanumeric, hyphens, underscores)
  if (!/^[a-zA-Z0-9_-]+$/.test(feature)) {
    logger.error('Feature name must contain only letters, numbers, hyphens, and underscores');
    logger.info('Example: wiggum new my-feature or wiggum new user_auth');
    process.exit(1);
  }

  // Check for reserved names
  const reservedNames = ['_example', '_template', 'config', 'ralph'];
  if (reservedNames.includes(feature.toLowerCase())) {
    logger.error(`"${feature}" is a reserved name. Please choose a different feature name.`);
    process.exit(1);
  }

  logger.info(`Creating new feature spec: ${pc.bold(feature)}`);
  console.log('');

  // Check for config
  if (!hasConfig(projectRoot)) {
    logger.warn('No ralph.config.cjs found. Run "wiggum init" first to configure your project.');
    logger.info('Using default paths...');
    console.log('');
  }

  // Load config
  const config = await loadConfigWithDefaults(projectRoot);
  const specsDir = join(projectRoot, config.paths.specs);

  // Create specs directory if it doesn't exist
  if (!existsSync(specsDir)) {
    logger.info(`Creating specs directory: ${specsDir}`);
    mkdirSync(specsDir, { recursive: true });
  }

  // Check if spec already exists
  const specPath = join(specsDir, `${feature}.md`);
  if (existsSync(specPath)) {
    if (!options.force) {
      logger.error(`Spec file already exists: ${specPath}`);

      if (!options.yes) {
        const shouldOverwrite = await prompts.confirm({
          message: 'Do you want to overwrite the existing spec?',
          initialValue: false,
        });

        if (prompts.isCancel(shouldOverwrite) || !shouldOverwrite) {
          logger.info('Cancelled');
          return;
        }
      } else {
        logger.info('Use --force to overwrite');
        return;
      }
    }

    logger.warn('Overwriting existing spec file');
  }

  // Determine if we should use AI generation
  const provider = options.provider || getAvailableProvider();
  const useAi = options.ai && provider !== null;

  let specContent: string;

  if (useAi && provider) {
    // Use AI-powered spec generation
    const model = options.model || getDefaultModelForProvider(provider);
    logger.info(`Using AI spec generation (${provider}/${model})`);

    // Get or perform scan
    let scanResult = options.scanResult;
    if (!scanResult) {
      const scanner = new Scanner();
      scanResult = await scanner.scan(projectRoot);
    }

    // Check if TUI mode is requested
    if (options.tui) {
      // Use Ink TUI for interview
      logger.info('Starting interactive TUI mode...');
      console.log('');

      // Create session state for TUI
      const sessionState = createSessionState(
        projectRoot,
        provider,
        model,
        scanResult,
        config,
        true // initialized
      );

      // Wrap in a promise to get the generated spec
      const generatedSpec = await new Promise<string | null>((resolve) => {
        const instance = renderApp({
          screen: 'interview',
          initialSessionState: sessionState,
          interviewProps: {
            featureName: feature,
            projectRoot,
            provider,
            model,
            scanResult,
          },
          onComplete: (spec) => {
            instance.unmount();
            resolve(spec);
          },
          onExit: () => {
            instance.unmount();
            resolve(null);
          },
        });
      });

      if (!generatedSpec) {
        logger.info('Spec generation cancelled');
        return;
      }

      specContent = generatedSpec;
    } else {
      // Use readline-based SpecGenerator
      const specGenerator = new SpecGenerator({
        featureName: feature,
        projectRoot,
        provider,
        model,
        scanResult,
      });

      // Initialize tracing BEFORE creating parent span (ensures logger is ready)
      initTracing();

      const generatedSpec = await traced(
        async () => {
          // All AI calls inside run() automatically become child spans
          return await specGenerator.run();
        },
        {
          name: `generate-spec-${feature}`,
          type: 'task',
        }
      );

      // Flush any pending Braintrust tracing spans
      await flushTracing();

      if (!generatedSpec) {
        logger.info('Spec generation cancelled');
        return;
      }

      specContent = generatedSpec;
    }

    // Confirm saving (unless --yes)
    if (!options.yes) {
      console.log('');
      const shouldSave = await prompts.confirm({
        message: `Save spec to ${specPath}?`,
        initialValue: true,
      });

      if (prompts.isCancel(shouldSave) || !shouldSave) {
        logger.info('Spec not saved');
        return;
      }
    }
  } else {
    // Use template-based generation
    if (options.ai && !provider) {
      logger.warn('No API key found. Falling back to template mode.');
      logger.info('Set ANTHROPIC_API_KEY, OPENAI_API_KEY, or OPENROUTER_API_KEY for AI generation.');
      console.log('');
    }

    // Find or use default template
    let templateContent: string;

    // Try to find _example.md template
    const exampleTemplate = await findExampleTemplate(projectRoot);
    if (exampleTemplate) {
      logger.info(`Using template: ${exampleTemplate}`);
      templateContent = readFileSync(exampleTemplate, 'utf-8');
    } else {
      // Try package template
      const packageTemplateDir = getPackageTemplateDir();
      const packageTemplate = join(packageTemplateDir, '_example.md.tmpl');
      if (existsSync(packageTemplate)) {
        logger.info(`Using package template`);
        templateContent = readFileSync(packageTemplate, 'utf-8');
      } else {
        // Use default template
        logger.info('Using default template');
        templateContent = DEFAULT_SPEC_TEMPLATE;
      }
    }

    // Process template
    specContent = processTemplate(templateContent, feature);

    // Confirm with user (unless --yes)
    if (!options.yes) {
      console.log('');
      console.log(pc.cyan('--- Spec Preview ---'));
      console.log(`File: ${specPath}`);
      console.log('');

      // Show first few lines of the processed template
      const previewLines = specContent.split('\n').slice(0, 15);
      console.log(pc.dim(previewLines.join('\n')));
      if (specContent.split('\n').length > 15) {
        console.log(pc.dim('...'));
      }
      console.log('');

      const shouldCreate = await prompts.confirm({
        message: 'Create this spec file?',
        initialValue: true,
      });

      if (prompts.isCancel(shouldCreate) || !shouldCreate) {
        logger.info('Cancelled');
        return;
      }
    }
  }

  // Write the spec file
  try {
    writeFileSync(specPath, specContent, 'utf-8');
    logger.success(`Created spec: ${specPath}`);
  } catch (error) {
    logger.error(`Failed to create spec: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }

  // Open in editor if requested
  if (options.edit) {
    try {
      openInEditor(specPath, options.editor);
    } catch (error) {
      logger.warn(`Could not open editor: ${error instanceof Error ? error.message : String(error)}`);
      logger.info(`Manually open: ${specPath}`);
    }
  }

  // Display next steps
  console.log('');
  console.log('Next steps:');
  console.log(`  1. Edit the spec: ${pc.cyan(`$EDITOR ${specPath}`)}`);
  console.log(`  2. When ready, run: ${pc.cyan(`wiggum run ${feature}`)}`);
}
