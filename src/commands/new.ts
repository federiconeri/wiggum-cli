/**
 * New Command Types
 *
 * The new/interview workflow is now handled by the TUI (InterviewScreen.tsx).
 * This file provides type exports and utility functions.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfigWithDefaults } from '../utils/config.js';
import type { AIProvider, AVAILABLE_MODELS } from '../ai/providers.js';
import type { ScanResult } from '../scanner/index.js';

export interface NewOptions {
  /** Open in editor after creation */
  edit?: boolean;
  /** Editor to use (defaults to $EDITOR or 'code') */
  editor?: string;
  /** Force overwrite if file exists */
  force?: boolean;
  /** AI provider (anthropic, openai, openrouter) */
  provider?: AIProvider;
  /** Model to use for AI generation */
  model?: string;
  /** Pre-loaded scan result (from session) */
  scanResult?: ScanResult;
}

/**
 * Default spec template content
 */
export const DEFAULT_SPEC_TEMPLATE = `# {{feature}} Feature Specification

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
 * Find the _example.md template
 */
export async function findExampleTemplate(projectRoot: string): Promise<string | null> {
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
export function getPackageTemplateDir(): string {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  return join(__dirname, '..', 'templates', 'specs');
}

/**
 * Process template variables
 */
export function processTemplate(template: string, feature: string): string {
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
