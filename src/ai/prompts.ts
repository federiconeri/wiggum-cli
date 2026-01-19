/**
 * AI Analysis Prompts
 * Defines prompts for codebase analysis and enhancement
 */

import type { ScanResult, DetectedStack } from '../scanner/types.js';

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
 * System prompt for codebase analysis
 */
export const SYSTEM_PROMPT = `You are an expert software architect analyzing a codebase to provide insights for AI-assisted development.

Your role is to:
1. Analyze the detected tech stack and provide deeper insights
2. Identify architectural patterns and coding conventions
3. Suggest improvements to the detection results
4. Recommend MCP servers that would benefit this project
5. Generate custom prompt suggestions for AI coding assistants

Be concise and actionable. Focus on practical insights that help developers work more effectively with AI tools.

Respond in valid JSON format only.`;

/**
 * Create the codebase analysis prompt
 */
export function createAnalysisPrompt(scanResult: ScanResult): string {
  const stackInfo = formatStackForPrompt(scanResult.stack);

  return `Analyze this codebase and provide enhanced insights.

Project Root: ${scanResult.projectRoot}

Detected Stack:
${stackInfo || 'No technologies detected'}

Based on this stack, provide analysis in the following JSON format:
{
  "frameworkInsights": {
    "variant": "more specific variant if detectable (e.g., 'app-router', 'pages-router', 'spa', 'ssr')",
    "confidence": "high/medium/low",
    "notes": "any additional observations about framework usage"
  },
  "architecturalPatterns": [
    {
      "pattern": "pattern name",
      "confidence": "high/medium/low",
      "evidence": "why you think this pattern is used"
    }
  ],
  "codingConventions": [
    {
      "convention": "convention name",
      "suggestion": "how to follow this convention"
    }
  ],
  "recommendedMcpServers": [
    {
      "name": "server name",
      "reason": "why this would be useful"
    }
  ],
  "customPromptSuggestions": [
    "Specific prompt suggestions tailored to this codebase"
  ],
  "additionalDetections": {
    "possibleMissed": ["technologies that might be in use but weren't detected"],
    "refinements": ["suggestions to improve existing detections"]
  }
}

Only include sections where you have meaningful insights. Keep responses focused and actionable.`;
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
