/**
 * Detector Registry
 * Registers and manages all detectors for the scanner
 */

import type { Detector, DetectorCategory, DetectionResult, DetectedStack, MCPStack } from './types.js';

// Import core detectors
import { frameworkDetector } from './detectors/core/framework.js';
import { packageManagerDetector } from './detectors/core/packageManager.js';
import { testingDetector } from './detectors/core/testing.js';
import { stylingDetector } from './detectors/core/styling.js';

// Import data layer detectors
import { databaseDetector } from './detectors/data/database.js';
import { ormDetector } from './detectors/data/orm.js';
import { apiDetector } from './detectors/data/api.js';

// Import frontend detectors
import { stateManagementDetector } from './detectors/frontend/stateManagement.js';
import { uiComponentsDetector } from './detectors/frontend/uiComponents.js';
import { formHandlingDetector } from './detectors/frontend/formHandling.js';

// Import services detectors
import { authDetector } from './detectors/services/auth.js';
import { analyticsDetector } from './detectors/services/analytics.js';
import { paymentsDetector } from './detectors/services/payments.js';
import { emailDetector } from './detectors/services/email.js';

// Import infrastructure detectors
import { deploymentDetector } from './detectors/infra/deployment.js';
import { monorepoDetector } from './detectors/infra/monorepo.js';

// Import MCP detectors
import { mcpServersDetector, getRecommendedMCPServers } from './detectors/mcp/mcpServers.js';
import { mcpProjectDetector } from './detectors/mcp/mcpProject.js';

/**
 * All detector categories
 */
const ALL_CATEGORIES: DetectorCategory[] = [
  // Core
  'framework',
  'packageManager',
  'testing',
  'styling',
  // Data Layer
  'database',
  'orm',
  'api',
  // Frontend
  'stateManagement',
  'uiComponents',
  'formHandling',
  // Services
  'auth',
  'analytics',
  'payments',
  'email',
  // Infrastructure
  'deployment',
  'monorepo',
  // MCP
  'mcp',
];

/**
 * Detector Registry class
 * Manages registration and execution of detectors
 */
export class DetectorRegistry {
  private detectors: Map<DetectorCategory, Detector[]> = new Map();

  constructor() {
    // Initialize all categories
    for (const category of ALL_CATEGORIES) {
      this.detectors.set(category, []);
    }
  }

  /**
   * Register a detector
   */
  register(detector: Detector): void {
    const category = this.detectors.get(detector.category);
    if (category) {
      category.push(detector);
    }
  }

  /**
   * Get all detectors for a category
   */
  getDetectors(category: DetectorCategory): Detector[] {
    return this.detectors.get(category) || [];
  }

  /**
   * Get all registered detectors
   */
  getAllDetectors(): Detector[] {
    const all: Detector[] = [];
    for (const detectors of this.detectors.values()) {
      all.push(...detectors);
    }
    return all;
  }

  /**
   * Run a single-result detector category
   */
  private async runSingleDetector(
    projectRoot: string,
    category: DetectorCategory
  ): Promise<DetectionResult | null> {
    for (const detector of this.getDetectors(category)) {
      const result = await detector.detect(projectRoot);
      if (result && !Array.isArray(result)) {
        return result;
      }
    }
    return null;
  }

  /**
   * Run a multi-result detector category
   */
  private async runMultiDetector(
    projectRoot: string,
    category: DetectorCategory
  ): Promise<DetectionResult[] | null> {
    for (const detector of this.getDetectors(category)) {
      const result = await detector.detect(projectRoot);
      if (result) {
        return Array.isArray(result) ? result : [result];
      }
    }
    return null;
  }

  /**
   * Run all detectors for a project
   */
  async runAllDetectors(projectRoot: string): Promise<DetectedStack> {
    const stack: DetectedStack = {};

    // ============ Core ============

    // Run framework detector
    stack.framework = await this.runSingleDetector(projectRoot, 'framework') || undefined;

    // Run package manager detector
    stack.packageManager = await this.runSingleDetector(projectRoot, 'packageManager') || undefined;

    // Run testing detectors
    for (const detector of this.getDetectors('testing')) {
      const result = await detector.detect(projectRoot);
      if (result) {
        stack.testing = {};
        if (Array.isArray(result)) {
          for (const r of result) {
            if (r.variant === 'unit') {
              stack.testing.unit = r;
            } else if (r.variant === 'e2e') {
              stack.testing.e2e = r;
            }
          }
        } else {
          // Single result, determine type from name
          if (result.name === 'Jest' || result.name === 'Vitest') {
            stack.testing.unit = result;
          } else {
            stack.testing.e2e = result;
          }
        }
        break;
      }
    }

    // Run styling detector
    stack.styling = await this.runSingleDetector(projectRoot, 'styling') || undefined;

    // ============ Data Layer ============

    // Run database detector
    stack.database = await this.runSingleDetector(projectRoot, 'database') || undefined;

    // Run ORM detector
    stack.orm = await this.runSingleDetector(projectRoot, 'orm') || undefined;

    // Run API detector (multi-result)
    stack.api = await this.runMultiDetector(projectRoot, 'api') || undefined;

    // ============ Frontend ============

    // Run state management detector
    stack.stateManagement = await this.runSingleDetector(projectRoot, 'stateManagement') || undefined;

    // Run UI components detector (multi-result)
    stack.uiComponents = await this.runMultiDetector(projectRoot, 'uiComponents') || undefined;

    // Run form handling detector (multi-result)
    stack.formHandling = await this.runMultiDetector(projectRoot, 'formHandling') || undefined;

    // ============ Services ============

    // Run auth detector
    stack.auth = await this.runSingleDetector(projectRoot, 'auth') || undefined;

    // Run analytics detector (multi-result)
    stack.analytics = await this.runMultiDetector(projectRoot, 'analytics') || undefined;

    // Run payments detector
    stack.payments = await this.runSingleDetector(projectRoot, 'payments') || undefined;

    // Run email detector
    stack.email = await this.runSingleDetector(projectRoot, 'email') || undefined;

    // ============ Infrastructure ============

    // Run deployment detector (multi-result)
    stack.deployment = await this.runMultiDetector(projectRoot, 'deployment') || undefined;

    // Run monorepo detector
    stack.monorepo = await this.runSingleDetector(projectRoot, 'monorepo') || undefined;

    // ============ MCP ============

    // Run MCP detectors
    const mcpStack: MCPStack = {};

    // Detect configured MCP servers
    const mcpServers = await this.runMultiDetector(projectRoot, 'mcp');

    // Separate MCP server configs from MCP project detection
    if (mcpServers) {
      const serverConfigs = mcpServers.filter(r => r.name.startsWith('MCP:') || r.name === 'MCP Config Directory');
      const projectInfo = mcpServers.find(r => r.name === 'MCP Server Project' || r.name === 'MCP Client');

      if (serverConfigs.length > 0) {
        mcpStack.detected = serverConfigs;
      }

      if (projectInfo) {
        mcpStack.isProject = projectInfo.name === 'MCP Server Project';
        mcpStack.projectInfo = projectInfo;
      }
    }

    // Get recommended MCP servers based on stack
    mcpStack.recommended = getRecommendedMCPServers(projectRoot);

    // Only add MCP stack if there's meaningful data
    if (mcpStack.detected || mcpStack.isProject || (mcpStack.recommended && mcpStack.recommended.length > 0)) {
      stack.mcp = mcpStack;
    }

    return stack;
  }
}

/**
 * Create a registry with all core detectors pre-registered
 */
export function createDefaultRegistry(): DetectorRegistry {
  const registry = new DetectorRegistry();

  // Register core detectors
  registry.register(frameworkDetector);
  registry.register(packageManagerDetector);
  registry.register(testingDetector);
  registry.register(stylingDetector);

  // Register data layer detectors
  registry.register(databaseDetector);
  registry.register(ormDetector);
  registry.register(apiDetector);

  // Register frontend detectors
  registry.register(stateManagementDetector);
  registry.register(uiComponentsDetector);
  registry.register(formHandlingDetector);

  // Register services detectors
  registry.register(authDetector);
  registry.register(analyticsDetector);
  registry.register(paymentsDetector);
  registry.register(emailDetector);

  // Register infrastructure detectors
  registry.register(deploymentDetector);
  registry.register(monorepoDetector);

  // Register MCP detectors
  registry.register(mcpServersDetector);
  registry.register(mcpProjectDetector);

  return registry;
}

export { DetectorRegistry as Registry };
