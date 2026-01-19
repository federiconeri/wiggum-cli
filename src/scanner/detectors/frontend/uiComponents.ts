/**
 * UI Components Detector
 * Detects: shadcn, Radix, MUI, Chakra, Ant Design, Headless UI
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
 * Find all matching dependencies by pattern
 */
function findMatchingDeps(deps: Record<string, string>, pattern: string): string[] {
  return Object.keys(deps).filter(name => name.startsWith(pattern));
}

/**
 * Detect shadcn/ui
 */
function detectShadcn(projectRoot: string, deps: Record<string, string>): DetectionResult | null {
  const evidence: string[] = [];
  let confidence = 0;

  // Check for components.json (shadcn config file)
  const componentsJsonPath = join(projectRoot, 'components.json');
  if (existsSync(componentsJsonPath)) {
    evidence.push('components.json found');
    confidence += 60;

    // Try to read and validate it's a shadcn config
    try {
      const content = readFileSync(componentsJsonPath, 'utf-8');
      const config = JSON.parse(content);
      if (config.style || config.rsc || config.tsx || config.components) {
        evidence.push('Valid shadcn/ui configuration detected');
        confidence += 20;
      }
    } catch {
      // File exists but couldn't be parsed
    }
  }

  // Check for @radix-ui/* packages (shadcn uses Radix primitives)
  const radixPackages = findMatchingDeps(deps, '@radix-ui/');
  if (radixPackages.length >= 3) {
    evidence.push(`Multiple @radix-ui packages found (${radixPackages.length})`);
    confidence += 20;
  }

  // Check for class-variance-authority (commonly used with shadcn)
  if (deps['class-variance-authority']) {
    evidence.push('class-variance-authority detected (common with shadcn)');
    confidence += 10;
  }

  // Check for clsx or tailwind-merge (common utilities with shadcn)
  if (deps.clsx || deps['tailwind-merge']) {
    evidence.push('clsx/tailwind-merge utilities detected');
    confidence += 5;
  }

  if (confidence === 0) return null;

  return {
    name: 'shadcn/ui',
    confidence: Math.min(confidence, 100),
    evidence,
  };
}

/**
 * Detect Radix UI (standalone, not as part of shadcn)
 */
function detectRadix(projectRoot: string, deps: Record<string, string>): DetectionResult | null {
  const evidence: string[] = [];
  let confidence = 0;

  // Check for @radix-ui/* packages
  const radixPackages = findMatchingDeps(deps, '@radix-ui/');
  if (radixPackages.length > 0) {
    evidence.push(`@radix-ui packages found: ${radixPackages.slice(0, 5).join(', ')}${radixPackages.length > 5 ? '...' : ''}`);
    confidence += 50 + Math.min(radixPackages.length * 5, 30);
  }

  // Check for @radix-ui/themes (full theme package)
  if (deps['@radix-ui/themes']) {
    evidence.push('@radix-ui/themes found');
    confidence += 20;
  }

  if (confidence === 0) return null;

  return {
    name: 'Radix UI',
    confidence: Math.min(confidence, 100),
    evidence,
  };
}

/**
 * Detect Material UI (MUI)
 */
function detectMUI(deps: Record<string, string>): DetectionResult | null {
  const evidence: string[] = [];
  let confidence = 0;

  // Check for @mui/material
  if (deps['@mui/material']) {
    evidence.push(`@mui/material@${deps['@mui/material']} in dependencies`);
    confidence += 70;
  }

  // Check for @mui/icons-material
  if (deps['@mui/icons-material']) {
    evidence.push('@mui/icons-material found');
    confidence += 10;
  }

  // Check for @mui/x-* (data grid, date pickers, etc.)
  const muiXPackages = findMatchingDeps(deps, '@mui/x-');
  if (muiXPackages.length > 0) {
    evidence.push(`MUI X packages found: ${muiXPackages.join(', ')}`);
    confidence += 10;
  }

  // Check for @emotion (MUI's default styling)
  if (deps['@emotion/react'] || deps['@emotion/styled']) {
    evidence.push('Emotion styling detected (MUI default)');
    confidence += 10;
  }

  if (confidence === 0) return null;

  return {
    name: 'MUI',
    version: deps['@mui/material'],
    confidence: Math.min(confidence, 100),
    evidence,
  };
}

/**
 * Detect Chakra UI
 */
function detectChakra(deps: Record<string, string>): DetectionResult | null {
  const evidence: string[] = [];
  let confidence = 0;

  // Check for @chakra-ui/react
  if (deps['@chakra-ui/react']) {
    evidence.push(`@chakra-ui/react@${deps['@chakra-ui/react']} in dependencies`);
    confidence += 80;
  }

  // Check for @chakra-ui/* packages
  const chakraPackages = findMatchingDeps(deps, '@chakra-ui/');
  if (chakraPackages.length > 1) {
    evidence.push(`Multiple Chakra packages found (${chakraPackages.length})`);
    confidence += 10;
  }

  if (confidence === 0) return null;

  return {
    name: 'Chakra UI',
    version: deps['@chakra-ui/react'],
    confidence: Math.min(confidence, 100),
    evidence,
  };
}

/**
 * Detect Ant Design
 */
function detectAntDesign(deps: Record<string, string>): DetectionResult | null {
  const evidence: string[] = [];
  let confidence = 0;

  if (deps.antd) {
    evidence.push(`antd@${deps.antd} in dependencies`);
    confidence += 80;
  }

  // Check for @ant-design/* packages
  const antPackages = findMatchingDeps(deps, '@ant-design/');
  if (antPackages.length > 0) {
    evidence.push(`Ant Design packages found: ${antPackages.join(', ')}`);
    confidence += 10;
  }

  if (confidence === 0) return null;

  return {
    name: 'Ant Design',
    version: deps.antd,
    confidence: Math.min(confidence, 100),
    evidence,
  };
}

/**
 * Detect Headless UI
 */
function detectHeadlessUI(deps: Record<string, string>): DetectionResult | null {
  const evidence: string[] = [];
  let confidence = 0;

  // Check for @headlessui/react
  if (deps['@headlessui/react']) {
    evidence.push(`@headlessui/react@${deps['@headlessui/react']} in dependencies`);
    confidence += 80;
  }

  // Check for @headlessui/vue
  if (deps['@headlessui/vue']) {
    evidence.push(`@headlessui/vue@${deps['@headlessui/vue']} in dependencies`);
    confidence += 80;
  }

  if (confidence === 0) return null;

  return {
    name: 'Headless UI',
    version: deps['@headlessui/react'] || deps['@headlessui/vue'],
    confidence: Math.min(confidence, 100),
    evidence,
  };
}

/**
 * Detect daisyUI
 */
function detectDaisyUI(deps: Record<string, string>): DetectionResult | null {
  const evidence: string[] = [];
  let confidence = 0;

  if (deps.daisyui) {
    evidence.push(`daisyui@${deps.daisyui} in dependencies`);
    confidence += 80;
  }

  if (confidence === 0) return null;

  return {
    name: 'daisyUI',
    version: deps.daisyui,
    confidence: Math.min(confidence, 100),
    evidence,
  };
}

/**
 * UI Components detector
 * Returns all detected UI libraries (projects often use multiple)
 */
export const uiComponentsDetector: Detector = {
  category: 'uiComponents',
  name: 'UI Components Detector',

  async detect(projectRoot: string): Promise<DetectionResult[] | null> {
    const pkg = readPackageJson(projectRoot);
    if (!pkg) {
      return null;
    }

    const deps = getDependencies(pkg);
    const results: DetectionResult[] = [];

    // Check for shadcn first (it uses Radix under the hood)
    const shadcn = detectShadcn(projectRoot, deps);
    if (shadcn && shadcn.confidence >= 40) {
      results.push(shadcn);
    }

    // Only add Radix as separate if not using shadcn
    if (!shadcn || shadcn.confidence < 40) {
      const radix = detectRadix(projectRoot, deps);
      if (radix && radix.confidence >= 40) {
        results.push(radix);
      }
    }

    // Check other UI libraries
    const detectors = [
      () => detectMUI(deps),
      () => detectChakra(deps),
      () => detectAntDesign(deps),
      () => detectHeadlessUI(deps),
      () => detectDaisyUI(deps),
    ];

    for (const detector of detectors) {
      const result = detector();
      if (result && result.confidence >= 40) {
        results.push(result);
      }
    }

    return results.length > 0 ? results : null;
  },
};

export default uiComponentsDetector;
