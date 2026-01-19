/**
 * Monorepo Tool Detector
 * Detects: Turborepo, Nx, pnpm workspaces, Lerna
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Detector, DetectionResult } from '../../types.js';

/**
 * Read and parse package.json from a directory
 */
function readPackageJson(projectRoot: string): Record<string, unknown> | null {
  const packageJsonPath = join(projectRoot, 'package.json');
  if (!existsSync(packageJsonPath)) {
    return null;
  }
  try {
    const content = readFileSync(packageJsonPath, 'utf-8');
    return JSON.parse(content);
  } catch {
    return null;
  }
}

/**
 * Get all dependencies from package.json (deps + devDeps)
 */
function getDependencies(pkg: Record<string, unknown>): Record<string, string> {
  const deps = (pkg.dependencies as Record<string, string>) || {};
  const devDeps = (pkg.devDependencies as Record<string, string>) || {};
  return { ...deps, ...devDeps };
}

/**
 * Detect Turborepo
 */
function detectTurborepo(projectRoot: string, deps: Record<string, string>): DetectionResult | null {
  const evidence: string[] = [];
  let confidence = 0;

  // Check for turbo.json
  const turboJson = join(projectRoot, 'turbo.json');
  if (existsSync(turboJson)) {
    evidence.push('turbo.json found');
    confidence += 60;
  }

  // Check for turbo in dependencies
  if (deps.turbo) {
    evidence.push(`turbo@${deps.turbo} in devDependencies`);
    confidence += 40;
  }

  if (confidence === 0) return null;

  return {
    name: 'Turborepo',
    version: deps.turbo,
    confidence: Math.min(confidence, 100),
    evidence,
  };
}

/**
 * Detect Nx
 */
function detectNx(projectRoot: string, deps: Record<string, string>): DetectionResult | null {
  const evidence: string[] = [];
  let confidence = 0;

  // Check for nx.json
  const nxJson = join(projectRoot, 'nx.json');
  if (existsSync(nxJson)) {
    evidence.push('nx.json found');
    confidence += 60;
  }

  // Check for nx in dependencies
  if (deps.nx) {
    evidence.push(`nx@${deps.nx} in devDependencies`);
    confidence += 40;
  }

  // Check for @nrwl/* packages (older Nx packages)
  if (deps['@nrwl/workspace'] || deps['@nx/workspace']) {
    evidence.push('Nx workspace package found');
    confidence += 20;
  }

  if (confidence === 0) return null;

  return {
    name: 'Nx',
    version: deps.nx,
    confidence: Math.min(confidence, 100),
    evidence,
  };
}

/**
 * Detect pnpm workspaces
 */
function detectPnpmWorkspaces(projectRoot: string): DetectionResult | null {
  const evidence: string[] = [];
  let confidence = 0;

  // Check for pnpm-workspace.yaml
  const pnpmWorkspace = join(projectRoot, 'pnpm-workspace.yaml');
  if (existsSync(pnpmWorkspace)) {
    evidence.push('pnpm-workspace.yaml found');
    confidence += 80;
  }

  if (confidence === 0) return null;

  return {
    name: 'pnpm Workspaces',
    confidence: Math.min(confidence, 100),
    evidence,
  };
}

/**
 * Detect npm/yarn workspaces
 */
function detectNpmYarnWorkspaces(projectRoot: string, pkg: Record<string, unknown>): DetectionResult | null {
  const evidence: string[] = [];
  let confidence = 0;
  let variant: string | undefined;

  // Check for workspaces field in package.json
  if (pkg.workspaces) {
    evidence.push('workspaces field in package.json');
    confidence += 70;

    // Determine if it's yarn or npm based on lock files
    const yarnLock = join(projectRoot, 'yarn.lock');
    const npmLock = join(projectRoot, 'package-lock.json');

    if (existsSync(yarnLock)) {
      variant = 'yarn';
      evidence.push('yarn.lock found');
    } else if (existsSync(npmLock)) {
      variant = 'npm';
      evidence.push('package-lock.json found');
    }
  }

  if (confidence === 0) return null;

  return {
    name: variant === 'yarn' ? 'Yarn Workspaces' : 'npm Workspaces',
    variant,
    confidence: Math.min(confidence, 100),
    evidence,
  };
}

/**
 * Detect Lerna
 */
function detectLerna(projectRoot: string, deps: Record<string, string>): DetectionResult | null {
  const evidence: string[] = [];
  let confidence = 0;

  // Check for lerna.json
  const lernaJson = join(projectRoot, 'lerna.json');
  if (existsSync(lernaJson)) {
    evidence.push('lerna.json found');
    confidence += 70;
  }

  // Check for lerna in dependencies
  if (deps.lerna) {
    evidence.push(`lerna@${deps.lerna} in devDependencies`);
    confidence += 30;
  }

  if (confidence === 0) return null;

  return {
    name: 'Lerna',
    version: deps.lerna,
    confidence: Math.min(confidence, 100),
    evidence,
  };
}

/**
 * Detect Rush
 */
function detectRush(projectRoot: string): DetectionResult | null {
  const evidence: string[] = [];
  let confidence = 0;

  // Check for rush.json
  const rushJson = join(projectRoot, 'rush.json');
  if (existsSync(rushJson)) {
    evidence.push('rush.json found');
    confidence += 80;
  }

  if (confidence === 0) return null;

  return {
    name: 'Rush',
    confidence: Math.min(confidence, 100),
    evidence,
  };
}

/**
 * Monorepo tool detector
 * Returns the primary monorepo tool detected
 */
export const monorepoDetector: Detector = {
  category: 'monorepo',
  name: 'Monorepo Tool Detector',

  async detect(projectRoot: string): Promise<DetectionResult | null> {
    const pkg = readPackageJson(projectRoot);
    const deps = pkg ? getDependencies(pkg) : {};

    // Priority: dedicated monorepo tools first, then workspace configs
    const detectors = [
      () => detectTurborepo(projectRoot, deps),
      () => detectNx(projectRoot, deps),
      () => detectLerna(projectRoot, deps),
      () => detectRush(projectRoot),
      () => detectPnpmWorkspaces(projectRoot),
      () => pkg ? detectNpmYarnWorkspaces(projectRoot, pkg) : null,
    ];

    // Find the highest confidence result
    let bestResult: DetectionResult | null = null;
    let bestConfidence = 0;

    for (const detector of detectors) {
      const result = detector();
      if (result && result.confidence > bestConfidence) {
        bestResult = result;
        bestConfidence = result.confidence;
      }
    }

    return bestResult && bestResult.confidence >= 40 ? bestResult : null;
  },
};

export default monorepoDetector;
