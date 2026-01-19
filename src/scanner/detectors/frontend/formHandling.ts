/**
 * Form Handling Detector
 * Detects: React Hook Form, Formik, Zod, Yup
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
 * Detect React Hook Form
 */
function detectReactHookForm(deps: Record<string, string>): DetectionResult | null {
  const evidence: string[] = [];
  let confidence = 0;

  if (deps['react-hook-form']) {
    evidence.push(`react-hook-form@${deps['react-hook-form']} in dependencies`);
    confidence += 80;
  }

  // Check for @hookform/resolvers (validation integrations)
  if (deps['@hookform/resolvers']) {
    evidence.push('@hookform/resolvers found');
    confidence += 10;
  }

  // Check for @hookform/devtools
  if (deps['@hookform/devtools']) {
    evidence.push('@hookform/devtools found');
    confidence += 5;
  }

  if (confidence === 0) return null;

  return {
    name: 'React Hook Form',
    version: deps['react-hook-form'],
    confidence: Math.min(confidence, 100),
    evidence,
  };
}

/**
 * Detect Formik
 */
function detectFormik(deps: Record<string, string>): DetectionResult | null {
  const evidence: string[] = [];
  let confidence = 0;

  if (deps.formik) {
    evidence.push(`formik@${deps.formik} in dependencies`);
    confidence += 80;
  }

  if (confidence === 0) return null;

  return {
    name: 'Formik',
    version: deps.formik,
    confidence: Math.min(confidence, 100),
    evidence,
  };
}

/**
 * Detect Zod
 */
function detectZod(deps: Record<string, string>): DetectionResult | null {
  const evidence: string[] = [];
  let confidence = 0;

  if (deps.zod) {
    evidence.push(`zod@${deps.zod} in dependencies`);
    confidence += 80;
  }

  // Check for zod-to-json-schema
  if (deps['zod-to-json-schema']) {
    evidence.push('zod-to-json-schema found');
    confidence += 10;
  }

  if (confidence === 0) return null;

  return {
    name: 'Zod',
    version: deps.zod,
    variant: 'validation',
    confidence: Math.min(confidence, 100),
    evidence,
  };
}

/**
 * Detect Yup
 */
function detectYup(deps: Record<string, string>): DetectionResult | null {
  const evidence: string[] = [];
  let confidence = 0;

  if (deps.yup) {
    evidence.push(`yup@${deps.yup} in dependencies`);
    confidence += 80;
  }

  if (confidence === 0) return null;

  return {
    name: 'Yup',
    version: deps.yup,
    variant: 'validation',
    confidence: Math.min(confidence, 100),
    evidence,
  };
}

/**
 * Detect Valibot (lightweight alternative to Zod)
 */
function detectValibot(deps: Record<string, string>): DetectionResult | null {
  const evidence: string[] = [];
  let confidence = 0;

  if (deps.valibot) {
    evidence.push(`valibot@${deps.valibot} in dependencies`);
    confidence += 80;
  }

  if (confidence === 0) return null;

  return {
    name: 'Valibot',
    version: deps.valibot,
    variant: 'validation',
    confidence: Math.min(confidence, 100),
    evidence,
  };
}

/**
 * Detect TanStack Form
 */
function detectTanStackForm(deps: Record<string, string>): DetectionResult | null {
  const evidence: string[] = [];
  let confidence = 0;

  if (deps['@tanstack/react-form']) {
    evidence.push(`@tanstack/react-form@${deps['@tanstack/react-form']} in dependencies`);
    confidence += 80;
  }

  if (deps['@tanstack/vue-form']) {
    evidence.push(`@tanstack/vue-form@${deps['@tanstack/vue-form']} in dependencies`);
    confidence += 80;
  }

  if (confidence === 0) return null;

  return {
    name: 'TanStack Form',
    version: deps['@tanstack/react-form'] || deps['@tanstack/vue-form'],
    confidence: Math.min(confidence, 100),
    evidence,
  };
}

/**
 * Form handling detector
 * Returns all detected form/validation libraries (projects often use multiple)
 */
export const formHandlingDetector: Detector = {
  category: 'formHandling',
  name: 'Form Handling Detector',

  async detect(projectRoot: string): Promise<DetectionResult[] | null> {
    const pkg = readPackageJson(projectRoot);
    if (!pkg) {
      return null;
    }

    const deps = getDependencies(pkg);
    const results: DetectionResult[] = [];

    // Check form libraries
    const formDetectors = [
      () => detectReactHookForm(deps),
      () => detectFormik(deps),
      () => detectTanStackForm(deps),
    ];

    // Check validation libraries
    const validationDetectors = [
      () => detectZod(deps),
      () => detectYup(deps),
      () => detectValibot(deps),
    ];

    // Add form libraries
    for (const detector of formDetectors) {
      const result = detector();
      if (result && result.confidence >= 40) {
        results.push(result);
      }
    }

    // Add validation libraries
    for (const detector of validationDetectors) {
      const result = detector();
      if (result && result.confidence >= 40) {
        results.push(result);
      }
    }

    return results.length > 0 ? results : null;
  },
};

export default formHandlingDetector;
