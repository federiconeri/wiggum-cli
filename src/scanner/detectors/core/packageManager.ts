/**
 * Package Manager Detector
 * Detects: pnpm, yarn, bun, npm
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { Detector, DetectionResult } from '../../types.js';

interface LockFileInfo {
  name: string;
  file: string;
  confidence: number;
}

const LOCK_FILES: LockFileInfo[] = [
  { name: 'pnpm', file: 'pnpm-lock.yaml', confidence: 95 },
  { name: 'yarn', file: 'yarn.lock', confidence: 95 },
  { name: 'bun', file: 'bun.lockb', confidence: 95 },
  { name: 'npm', file: 'package-lock.json', confidence: 95 },
];

/**
 * Package manager detector
 */
export const packageManagerDetector: Detector = {
  category: 'packageManager',
  name: 'Package Manager Detector',

  async detect(projectRoot: string): Promise<DetectionResult | null> {
    const evidence: string[] = [];

    // Check for lock files in order of preference
    for (const lockFile of LOCK_FILES) {
      const lockFilePath = join(projectRoot, lockFile.file);
      if (existsSync(lockFilePath)) {
        evidence.push(`${lockFile.file} found`);

        return {
          name: lockFile.name,
          confidence: lockFile.confidence,
          evidence,
        };
      }
    }

    // Check for packageManager field in package.json
    const packageJsonPath = join(projectRoot, 'package.json');
    if (existsSync(packageJsonPath)) {
      try {
        const { readFileSync } = await import('node:fs');
        const content = readFileSync(packageJsonPath, 'utf-8');
        const pkg = JSON.parse(content);

        if (pkg.packageManager) {
          const match = pkg.packageManager.match(/^(pnpm|yarn|npm|bun)@/);
          if (match) {
            const manager = match[1];
            const versionMatch = pkg.packageManager.match(/@([^\s]+)/);
            evidence.push(`packageManager field: ${pkg.packageManager}`);

            return {
              name: manager,
              version: versionMatch ? versionMatch[1] : undefined,
              confidence: 90,
              evidence,
            };
          }
        }
      } catch {
        // Ignore parse errors
      }
    }

    // Check for node_modules (fallback, assume npm)
    const nodeModulesPath = join(projectRoot, 'node_modules');
    if (existsSync(nodeModulesPath)) {
      evidence.push('node_modules exists, no lock file found');
      return {
        name: 'npm',
        confidence: 30, // Low confidence since we're just guessing
        evidence,
      };
    }

    // No package manager detected
    return null;
  },
};

export default packageManagerDetector;
