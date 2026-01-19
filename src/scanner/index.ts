/**
 * Scanner Orchestrator
 * Main entry point for project scanning
 */

import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createDefaultRegistry, DetectorRegistry } from './registry.js';
import type { ScanResult, ScannerOptions, DetectedStack, DetectionResult } from './types.js';

// Re-export types
export type {
  DetectionResult,
  DetectedStack,
  MCPStack,
  DetectorCategory,
  Detector,
  ScannerOptions,
  ScanResult,
} from './types.js';

// Re-export registry
export { DetectorRegistry, createDefaultRegistry } from './registry.js';

/**
 * Scanner class
 * Orchestrates detection of project tech stack
 */
export class Scanner {
  private registry: DetectorRegistry;
  private options: ScannerOptions;

  constructor(options: ScannerOptions = {}) {
    this.registry = createDefaultRegistry();
    this.options = {
      includeLowConfidence: false,
      minConfidence: 40,
      ...options,
    };
  }

  /**
   * Scan a project directory and detect its tech stack
   */
  async scan(projectRoot: string): Promise<ScanResult> {
    const startTime = Date.now();
    const errors: string[] = [];

    // Resolve to absolute path
    const absolutePath = resolve(projectRoot);

    // Validate project root exists
    if (!existsSync(absolutePath)) {
      throw new Error(`Project root does not exist: ${absolutePath}`);
    }

    // Run all detectors
    let stack: DetectedStack;
    try {
      stack = await this.registry.runAllDetectors(absolutePath);
    } catch (error) {
      errors.push(`Detection error: ${error instanceof Error ? error.message : String(error)}`);
      stack = {};
    }

    // Filter by confidence threshold if configured
    if (!this.options.includeLowConfidence && this.options.minConfidence) {
      stack = this.filterByConfidence(stack, this.options.minConfidence);
    }

    const scanTime = Date.now() - startTime;

    return {
      projectRoot: absolutePath,
      stack,
      scanTime,
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  /**
   * Filter array of detection results by confidence
   */
  private filterArrayByConfidence(
    results: DetectionResult[] | undefined,
    minConfidence: number
  ): DetectionResult[] | undefined {
    if (!results) return undefined;
    const filtered = results.filter(r => r.confidence >= minConfidence);
    return filtered.length > 0 ? filtered : undefined;
  }

  /**
   * Filter stack results by minimum confidence
   */
  private filterByConfidence(stack: DetectedStack, minConfidence: number): DetectedStack {
    const filtered: DetectedStack = {};

    // Core
    if (stack.framework && stack.framework.confidence >= minConfidence) {
      filtered.framework = stack.framework;
    }

    if (stack.packageManager && stack.packageManager.confidence >= minConfidence) {
      filtered.packageManager = stack.packageManager;
    }

    if (stack.testing) {
      const testing: DetectedStack['testing'] = {};
      if (stack.testing.unit && stack.testing.unit.confidence >= minConfidence) {
        testing.unit = stack.testing.unit;
      }
      if (stack.testing.e2e && stack.testing.e2e.confidence >= minConfidence) {
        testing.e2e = stack.testing.e2e;
      }
      if (testing.unit || testing.e2e) {
        filtered.testing = testing;
      }
    }

    if (stack.styling && stack.styling.confidence >= minConfidence) {
      filtered.styling = stack.styling;
    }

    // Data Layer
    if (stack.database && stack.database.confidence >= minConfidence) {
      filtered.database = stack.database;
    }

    if (stack.orm && stack.orm.confidence >= minConfidence) {
      filtered.orm = stack.orm;
    }

    filtered.api = this.filterArrayByConfidence(stack.api, minConfidence);

    // Frontend
    if (stack.stateManagement && stack.stateManagement.confidence >= minConfidence) {
      filtered.stateManagement = stack.stateManagement;
    }

    filtered.uiComponents = this.filterArrayByConfidence(stack.uiComponents, minConfidence);
    filtered.formHandling = this.filterArrayByConfidence(stack.formHandling, minConfidence);

    // Services
    if (stack.auth && stack.auth.confidence >= minConfidence) {
      filtered.auth = stack.auth;
    }

    filtered.analytics = this.filterArrayByConfidence(stack.analytics, minConfidence);

    if (stack.payments && stack.payments.confidence >= minConfidence) {
      filtered.payments = stack.payments;
    }

    if (stack.email && stack.email.confidence >= minConfidence) {
      filtered.email = stack.email;
    }

    // Infrastructure
    filtered.deployment = this.filterArrayByConfidence(stack.deployment, minConfidence);

    if (stack.monorepo && stack.monorepo.confidence >= minConfidence) {
      filtered.monorepo = stack.monorepo;
    }

    // MCP (keep as-is since it has its own structure)
    if (stack.mcp) {
      filtered.mcp = stack.mcp;
    }

    return filtered;
  }

  /**
   * Get the detector registry for custom detector registration
   */
  getRegistry(): DetectorRegistry {
    return this.registry;
  }
}

/**
 * Convenience function to scan a project
 */
export async function scanProject(projectRoot: string, options?: ScannerOptions): Promise<ScanResult> {
  const scanner = new Scanner(options);
  return scanner.scan(projectRoot);
}

/**
 * Helper to format a single detection result
 */
function formatDetection(label: string, result: DetectionResult | undefined, indent = ''): string[] {
  const lines: string[] = [];
  if (result) {
    const version = result.version ? `@${result.version}` : '';
    const variant = result.variant ? ` (${result.variant})` : '';
    lines.push(`${indent}${label}: ${result.name}${version}${variant} [${result.confidence}%]`);
    lines.push(`${indent}  Evidence: ${result.evidence.join(', ')}`);
  }
  return lines;
}

/**
 * Helper to format an array of detection results
 */
function formatDetectionArray(label: string, results: DetectionResult[] | undefined, indent = ''): string[] {
  const lines: string[] = [];
  if (results && results.length > 0) {
    lines.push(`${indent}${label}:`);
    for (const result of results) {
      const version = result.version ? `@${result.version}` : '';
      const variant = result.variant ? ` (${result.variant})` : '';
      lines.push(`${indent}  - ${result.name}${version}${variant} [${result.confidence}%]`);
    }
  }
  return lines;
}

/**
 * Format a scan result for display
 */
export function formatScanResult(result: ScanResult): string {
  const lines: string[] = [];
  const { stack } = result;

  lines.push(`Project: ${result.projectRoot}`);
  lines.push(`Scan time: ${result.scanTime}ms`);
  lines.push('');

  // ============ Core ============
  lines.push('=== Core ===');

  if (stack.framework) {
    lines.push(...formatDetection('Framework', stack.framework));
  } else {
    lines.push('Framework: Not detected');
  }

  if (stack.packageManager) {
    lines.push(...formatDetection('Package Manager', stack.packageManager));
  } else {
    lines.push('Package Manager: Not detected');
  }

  if (stack.testing) {
    if (stack.testing.unit) {
      lines.push(...formatDetection('Unit Testing', stack.testing.unit));
    }
    if (stack.testing.e2e) {
      lines.push(...formatDetection('E2E Testing', stack.testing.e2e));
    }
  }

  if (stack.styling) {
    lines.push(...formatDetection('Styling', stack.styling));
  }

  // ============ Data Layer ============
  if (stack.database || stack.orm || stack.api) {
    lines.push('');
    lines.push('=== Data Layer ===');

    if (stack.database) {
      lines.push(...formatDetection('Database', stack.database));
    }

    if (stack.orm) {
      lines.push(...formatDetection('ORM', stack.orm));
    }

    lines.push(...formatDetectionArray('API Patterns', stack.api));
  }

  // ============ Frontend ============
  if (stack.stateManagement || stack.uiComponents || stack.formHandling) {
    lines.push('');
    lines.push('=== Frontend ===');

    if (stack.stateManagement) {
      lines.push(...formatDetection('State Management', stack.stateManagement));
    }

    lines.push(...formatDetectionArray('UI Components', stack.uiComponents));
    lines.push(...formatDetectionArray('Form Handling', stack.formHandling));
  }

  // ============ Services ============
  if (stack.auth || stack.analytics || stack.payments || stack.email) {
    lines.push('');
    lines.push('=== Services ===');

    if (stack.auth) {
      lines.push(...formatDetection('Auth', stack.auth));
    }

    lines.push(...formatDetectionArray('Analytics', stack.analytics));

    if (stack.payments) {
      lines.push(...formatDetection('Payments', stack.payments));
    }

    if (stack.email) {
      lines.push(...formatDetection('Email', stack.email));
    }
  }

  // ============ Infrastructure ============
  if (stack.deployment || stack.monorepo) {
    lines.push('');
    lines.push('=== Infrastructure ===');

    lines.push(...formatDetectionArray('Deployment', stack.deployment));

    if (stack.monorepo) {
      lines.push(...formatDetection('Monorepo', stack.monorepo));
    }
  }

  // ============ MCP ============
  if (stack.mcp) {
    lines.push('');
    lines.push('=== MCP ===');

    if (stack.mcp.isProject) {
      lines.push('Type: MCP Server Project');
      if (stack.mcp.projectInfo) {
        lines.push(...formatDetection('Project Info', stack.mcp.projectInfo, '  '));
      }
    }

    if (stack.mcp.detected && stack.mcp.detected.length > 0) {
      lines.push('Configured MCP Servers:');
      for (const server of stack.mcp.detected) {
        lines.push(`  - ${server.name}`);
      }
    }

    if (stack.mcp.recommended && stack.mcp.recommended.length > 0) {
      lines.push(`Recommended MCP Servers: ${stack.mcp.recommended.join(', ')}`);
    }
  }

  // ============ Errors ============
  if (result.errors && result.errors.length > 0) {
    lines.push('');
    lines.push('Errors:');
    for (const error of result.errors) {
      lines.push(`  - ${error}`);
    }
  }

  return lines.join('\n');
}
