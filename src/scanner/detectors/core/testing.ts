/**
 * Testing Framework Detector
 * Detects unit testing (Jest, Vitest) and E2E testing (Playwright, Cypress)
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { Detector, DetectionResult } from '../../types.js';
import {
  readPackageJson,
  getDependencies,
  findConfigFile,
  type PackageJson,
  type DependencyMap,
} from '../utils.js';

/**
 * Detect Vitest
 */
function detectVitest(projectRoot: string, deps: DependencyMap): DetectionResult | null {
  const evidence: string[] = [];
  let confidence = 0;

  if (deps.vitest) {
    evidence.push(`vitest@${deps.vitest} in dependencies`);
    confidence += 60;
  }

  // Check for vitest config
  const configExtensions = ['.config.ts', '.config.js', '.config.mts', '.config.mjs'];
  const configFile = findConfigFile(projectRoot, 'vitest', configExtensions);
  if (configFile) {
    evidence.push(`${configFile} found`);
    confidence += 30;
  }

  // Vitest can also be configured in vite.config
  if (!configFile && deps.vitest) {
    const viteConfig = findConfigFile(projectRoot, 'vite.config', ['.ts', '.js', '.mjs']);
    if (viteConfig) {
      evidence.push('Vitest likely configured in vite.config');
      confidence += 10;
    }
  }

  if (confidence === 0) return null;

  return {
    name: 'Vitest',
    version: deps.vitest,
    confidence: Math.min(confidence, 100),
    evidence,
  };
}

/**
 * Detect Jest
 */
function detectJest(projectRoot: string, deps: DependencyMap, pkg: PackageJson): DetectionResult | null {
  const evidence: string[] = [];
  let confidence = 0;

  if (deps.jest) {
    evidence.push(`jest@${deps.jest} in dependencies`);
    confidence += 50;
  }

  // Check for jest config files
  const configExtensions = ['.config.js', '.config.ts', '.config.mjs', '.config.cjs'];
  const configFile = findConfigFile(projectRoot, 'jest', configExtensions);
  if (configFile) {
    evidence.push(`${configFile} found`);
    confidence += 30;
  }

  // Check for jest field in package.json
  if (pkg.jest) {
    evidence.push('jest config in package.json');
    confidence += 20;
  }

  // Check for related packages
  if (deps['@types/jest']) {
    evidence.push('@types/jest in dependencies');
    confidence += 10;
  }
  if (deps['ts-jest']) {
    evidence.push('ts-jest in dependencies');
    confidence += 10;
  }

  if (confidence === 0) return null;

  return {
    name: 'Jest',
    version: deps.jest,
    confidence: Math.min(confidence, 100),
    evidence,
  };
}

/**
 * Detect Playwright
 */
function detectPlaywright(projectRoot: string, deps: DependencyMap): DetectionResult | null {
  const evidence: string[] = [];
  let confidence = 0;

  if (deps['@playwright/test']) {
    evidence.push(`@playwright/test@${deps['@playwright/test']} in dependencies`);
    confidence += 60;
  } else if (deps.playwright) {
    evidence.push(`playwright@${deps.playwright} in dependencies`);
    confidence += 50;
  }

  // Check for playwright config
  const configExtensions = ['.config.ts', '.config.js', '.config.mjs'];
  const configFile = findConfigFile(projectRoot, 'playwright', configExtensions);
  if (configFile) {
    evidence.push(`${configFile} found`);
    confidence += 30;
  }

  if (confidence === 0) return null;

  return {
    name: 'Playwright',
    version: deps['@playwright/test'] || deps.playwright,
    confidence: Math.min(confidence, 100),
    evidence,
  };
}

/**
 * Detect Cypress
 */
function detectCypress(projectRoot: string, deps: DependencyMap): DetectionResult | null {
  const evidence: string[] = [];
  let confidence = 0;

  if (deps.cypress) {
    evidence.push(`cypress@${deps.cypress} in dependencies`);
    confidence += 60;
  }

  // Check for cypress config
  const configExtensions = ['.config.ts', '.config.js', '.config.mjs', '.config.cjs'];
  const configFile = findConfigFile(projectRoot, 'cypress', configExtensions);
  if (configFile) {
    evidence.push(`${configFile} found`);
    confidence += 30;
  }

  // Check for cypress folder
  const cypressFolder = join(projectRoot, 'cypress');
  if (existsSync(cypressFolder)) {
    evidence.push('cypress/ folder found');
    confidence += 10;
  }

  if (confidence === 0) return null;

  return {
    name: 'Cypress',
    version: deps.cypress,
    confidence: Math.min(confidence, 100),
    evidence,
  };
}

/**
 * Testing framework detector
 * Returns both unit and e2e test frameworks
 */
export const testingDetector: Detector = {
  category: 'testing',
  name: 'Testing Framework Detector',

  async detect(projectRoot: string): Promise<DetectionResult[] | null> {
    const pkg = readPackageJson(projectRoot);
    if (!pkg) {
      return null;
    }

    const deps = getDependencies(pkg);
    const results: DetectionResult[] = [];

    // Detect unit testing frameworks
    // Prefer Vitest if both are present (as Vitest is often added later)
    const vitest = detectVitest(projectRoot, deps);
    const jest = detectJest(projectRoot, deps, pkg);

    if (vitest && vitest.confidence >= 40) {
      results.push({ ...vitest, variant: 'unit' });
    } else if (jest && jest.confidence >= 40) {
      results.push({ ...jest, variant: 'unit' });
    }

    // Detect E2E testing frameworks
    const playwright = detectPlaywright(projectRoot, deps);
    const cypress = detectCypress(projectRoot, deps);

    // If both are present, include the one with higher confidence
    if (playwright && cypress) {
      if (playwright.confidence >= cypress.confidence) {
        results.push({ ...playwright, variant: 'e2e' });
      } else {
        results.push({ ...cypress, variant: 'e2e' });
      }
    } else if (playwright && playwright.confidence >= 40) {
      results.push({ ...playwright, variant: 'e2e' });
    } else if (cypress && cypress.confidence >= 40) {
      results.push({ ...cypress, variant: 'e2e' });
    }

    return results.length > 0 ? results : null;
  },
};

export default testingDetector;
