/**
 * AI Analysis Prompts
 * Defines prompts for codebase analysis and enhancement
 */

import type { ScanResult, DetectedStack } from '../scanner/types.js';
import { RIPGREP_SKILL } from './tools.js';

/**
 * Format the detected stack for inclusion in prompts
 */
export function formatStackForPrompt(stack: DetectedStack): string {
  const sections: string[] = [];

  // Core
  if (stack.framework) {
    const variant = stack.framework.variant ? ` (${stack.framework.variant})` : '';
    sections.push(`Framework: ${stack.framework.name}${variant}`);
  }
  if (stack.packageManager) {
    sections.push(`Package Manager: ${stack.packageManager.name}`);
  }
  if (stack.testing?.unit) {
    sections.push(`Unit Testing: ${stack.testing.unit.name}`);
  }
  if (stack.testing?.e2e) {
    sections.push(`E2E Testing: ${stack.testing.e2e.name}`);
  }
  if (stack.styling) {
    sections.push(`Styling: ${stack.styling.name}`);
  }

  // Data Layer
  if (stack.database) {
    sections.push(`Database: ${stack.database.name}`);
  }
  if (stack.orm) {
    sections.push(`ORM: ${stack.orm.name}`);
  }
  if (stack.api && stack.api.length > 0) {
    sections.push(`API Patterns: ${stack.api.map(a => a.name).join(', ')}`);
  }

  // Frontend
  if (stack.stateManagement) {
    sections.push(`State Management: ${stack.stateManagement.name}`);
  }
  if (stack.uiComponents && stack.uiComponents.length > 0) {
    sections.push(`UI Components: ${stack.uiComponents.map(u => u.name).join(', ')}`);
  }
  if (stack.formHandling && stack.formHandling.length > 0) {
    sections.push(`Form Handling: ${stack.formHandling.map(f => f.name).join(', ')}`);
  }

  // Services
  if (stack.auth) {
    sections.push(`Auth: ${stack.auth.name}`);
  }
  if (stack.analytics && stack.analytics.length > 0) {
    sections.push(`Analytics: ${stack.analytics.map(a => a.name).join(', ')}`);
  }
  if (stack.payments) {
    sections.push(`Payments: ${stack.payments.name}`);
  }
  if (stack.email) {
    sections.push(`Email: ${stack.email.name}`);
  }

  // Infrastructure
  if (stack.deployment && stack.deployment.length > 0) {
    sections.push(`Deployment: ${stack.deployment.map(d => d.name).join(', ')}`);
  }
  if (stack.monorepo) {
    sections.push(`Monorepo: ${stack.monorepo.name}`);
  }

  // MCP
  if (stack.mcp) {
    if (stack.mcp.isProject) {
      sections.push('MCP: This is an MCP server project');
    }
    if (stack.mcp.detected && stack.mcp.detected.length > 0) {
      sections.push(`MCP Servers: ${stack.mcp.detected.map(m => m.name).join(', ')}`);
    }
  }

  return sections.join('\n');
}

/**
 * System prompt for codebase analysis (agentic mode)
 */
export const SYSTEM_PROMPT_AGENTIC = `You are an expert codebase analyst with tools to explore the project.

Your goal is to thoroughly understand the codebase structure and produce actionable configuration for AI-assisted development.

## Exploration Strategy
1. First, list the root directory to understand project structure
2. Read package.json to understand scripts and dependencies
3. Search for key patterns: entry points, routes, components, tests
4. Identify naming conventions by examining existing files
5. Look for existing documentation (.md files, README)

## Tools Available
You have these tools to explore the codebase:
- searchCode: Search using ripgrep patterns
- readFile: Read file contents
- listDirectory: List directory structure
- getPackageInfo: Get package.json info

${RIPGREP_SKILL}

## Output Requirements
After exploration, output valid JSON with:
- projectContext: entry points, key directories, naming conventions
- commands: test, lint, build, dev commands from package.json
- implementationGuidelines: short actionable rules (5-10 words each, max 7)
- mcpServers: essential and recommended servers
- possibleMissedTechnologies: technologies that might be in use

Be concise. Focus on WHAT TO DO, not what exists.`;

/**
 * System prompt for codebase analysis (simple mode - no tools)
 */
export const SYSTEM_PROMPT = `You are analyzing a codebase to help configure AI-assisted development tools.

Your goal is to produce SHORT, ACTIONABLE output that helps AI coding assistants work effectively on this codebase.

Rules:
- Output valid JSON only
- Be extremely concise (5-10 words per item max)
- Focus on WHAT TO DO, not what exists
- Include specific file paths and commands
- Max 5-7 items per array
- No explanations, just actionable rules`;

/**
 * Create the codebase analysis prompt
 */
export function createAnalysisPrompt(scanResult: ScanResult): string {
  const stackInfo = formatStackForPrompt(scanResult.stack);

  return `Analyze this codebase for AI-assisted development configuration.

Project: ${scanResult.projectRoot}

Detected Stack:
${stackInfo || 'No technologies detected'}

Respond with this JSON structure (keep values SHORT - 5-10 words max per item):
{
  "projectContext": {
    "entryPoints": ["src/index.ts", "src/server.ts"],
    "keyDirectories": {
      "src/routes": "API route handlers",
      "src/models": "Database models"
    },
    "namingConventions": "camelCase files, PascalCase components"
  },
  "commands": {
    "test": "npm test",
    "lint": "npm run lint",
    "typecheck": "npm run typecheck",
    "build": "npm run build",
    "dev": "npm run dev"
  },
  "implementationGuidelines": [
    "Run npm test after every change",
    "Use Zod for request validation",
    "Place routes in src/routes/<resource>.ts",
    "Follow error pattern in src/utils/errors.ts"
  ],
  "mcpServers": {
    "essential": ["filesystem", "git"],
    "recommended": ["docker", "postgres"]
  },
  "possibleMissedTechnologies": ["Redis", "WebSockets"]
}

Important:
- implementationGuidelines should be short rules (not analysis prompts)
- Include actual file paths from this project
- Infer commands from package.json patterns
- Max 5-7 items per array`;
}

/**
 * Prompt for validating and improving scanner results
 */
export function createValidationPrompt(scanResult: ScanResult): string {
  const stackInfo = formatStackForPrompt(scanResult.stack);

  return `Review and validate these scanner detection results for accuracy.

Detected Stack:
${stackInfo || 'No technologies detected'}

For each detection, assess if it seems accurate based on common project patterns.
Identify any likely false positives or missing detections.

Respond in JSON format:
{
  "validations": [
    {
      "technology": "name",
      "status": "confirmed/uncertain/likely-false-positive",
      "notes": "explanation if uncertain or false positive"
    }
  ],
  "likelyMissed": [
    {
      "technology": "name",
      "reason": "why this might be in use"
    }
  ]
}`;
}

/**
 * Prompt for generating stack-specific recommendations
 */
export function createRecommendationsPrompt(scanResult: ScanResult): string {
  const stackInfo = formatStackForPrompt(scanResult.stack);

  return `Based on this tech stack, provide specific recommendations for AI-assisted development.

Detected Stack:
${stackInfo || 'No technologies detected'}

Provide recommendations in JSON format:
{
  "mcpServers": [
    {
      "name": "server identifier",
      "priority": "high/medium/low",
      "reason": "why this is recommended"
    }
  ],
  "aiToolingTips": [
    "Tips for working with AI tools on this codebase"
  ],
  "contextSuggestions": [
    "Important context an AI should know about this stack"
  ]
}

Focus on practical, actionable recommendations.`;
}
