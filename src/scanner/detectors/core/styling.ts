/**
 * Styling Detector
 * Detects: Tailwind, CSS Modules, styled-components, Sass/SCSS
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
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
 * Check if a config file exists (supports multiple extensions)
 */
function findConfigFile(projectRoot: string, baseName: string, extensions: string[]): string | null {
  for (const ext of extensions) {
    const filePath = join(projectRoot, `${baseName}${ext}`);
    if (existsSync(filePath)) {
      return `${baseName}${ext}`;
    }
  }
  return null;
}

/**
 * Check if CSS Module files exist in common directories
 */
function hasCssModules(projectRoot: string): boolean {
  const dirsToCheck = ['src', 'app', 'pages', 'components', 'styles'];

  for (const dir of dirsToCheck) {
    const dirPath = join(projectRoot, dir);
    if (existsSync(dirPath)) {
      try {
        const files = readdirSync(dirPath, { recursive: true });
        for (const file of files) {
          const fileName = typeof file === 'string' ? file : file.toString();
          if (fileName.includes('.module.css') || fileName.includes('.module.scss')) {
            return true;
          }
        }
      } catch {
        // Ignore directory read errors
      }
    }
  }

  return false;
}

/**
 * Detect Tailwind CSS
 */
function detectTailwind(projectRoot: string, deps: Record<string, string>): DetectionResult | null {
  const evidence: string[] = [];
  let confidence = 0;

  if (deps.tailwindcss) {
    evidence.push(`tailwindcss@${deps.tailwindcss} in dependencies`);
    confidence += 50;
  }

  // Check for tailwind config
  const configExtensions = ['.config.js', '.config.ts', '.config.mjs', '.config.cjs'];
  const configFile = findConfigFile(projectRoot, 'tailwind', configExtensions);
  if (configFile) {
    evidence.push(`${configFile} found`);
    confidence += 40;
  }

  // Check for postcss config (often paired with Tailwind)
  const postcssConfig = findConfigFile(projectRoot, 'postcss.config', ['.js', '.mjs', '.cjs']);
  if (postcssConfig && deps.tailwindcss) {
    evidence.push(`${postcssConfig} found`);
    confidence += 10;
  }

  if (confidence === 0) return null;

  // Detect Tailwind v4 (uses CSS-based config)
  let variant: string | undefined;
  if (deps.tailwindcss) {
    const version = deps.tailwindcss.replace(/[\^~]/, '');
    if (version.startsWith('4.')) {
      variant = 'v4';
    }
  }

  return {
    name: 'Tailwind CSS',
    version: deps.tailwindcss,
    variant,
    confidence: Math.min(confidence, 100),
    evidence,
  };
}

/**
 * Detect styled-components
 */
function detectStyledComponents(projectRoot: string, deps: Record<string, string>): DetectionResult | null {
  const evidence: string[] = [];
  let confidence = 0;

  if (deps['styled-components']) {
    evidence.push(`styled-components@${deps['styled-components']} in dependencies`);
    confidence += 80;
  }

  // Check for babel plugin
  if (deps['babel-plugin-styled-components']) {
    evidence.push('babel-plugin-styled-components in dependencies');
    confidence += 10;
  }

  if (confidence === 0) return null;

  return {
    name: 'styled-components',
    version: deps['styled-components'],
    confidence: Math.min(confidence, 100),
    evidence,
  };
}

/**
 * Detect Emotion
 */
function detectEmotion(projectRoot: string, deps: Record<string, string>): DetectionResult | null {
  const evidence: string[] = [];
  let confidence = 0;

  if (deps['@emotion/react'] || deps['@emotion/styled']) {
    const version = deps['@emotion/react'] || deps['@emotion/styled'];
    evidence.push(`@emotion packages@${version} in dependencies`);
    confidence += 80;
  }

  if (confidence === 0) return null;

  return {
    name: 'Emotion',
    version: deps['@emotion/react'] || deps['@emotion/styled'],
    confidence: Math.min(confidence, 100),
    evidence,
  };
}

/**
 * Detect Sass/SCSS
 */
function detectSass(projectRoot: string, deps: Record<string, string>): DetectionResult | null {
  const evidence: string[] = [];
  let confidence = 0;

  if (deps.sass) {
    evidence.push(`sass@${deps.sass} in dependencies`);
    confidence += 70;
  } else if (deps['node-sass']) {
    evidence.push(`node-sass@${deps['node-sass']} in dependencies`);
    confidence += 70;
  }

  if (confidence === 0) return null;

  return {
    name: 'Sass/SCSS',
    version: deps.sass || deps['node-sass'],
    confidence: Math.min(confidence, 100),
    evidence,
  };
}

/**
 * Detect CSS Modules
 */
function detectCssModules(projectRoot: string): DetectionResult | null {
  const evidence: string[] = [];
  let confidence = 0;

  if (hasCssModules(projectRoot)) {
    evidence.push('*.module.css or *.module.scss files found');
    confidence += 80;
  }

  if (confidence === 0) return null;

  return {
    name: 'CSS Modules',
    confidence: Math.min(confidence, 100),
    evidence,
  };
}

/**
 * Styling detector
 * Returns the primary styling approach detected
 */
export const stylingDetector: Detector = {
  category: 'styling',
  name: 'Styling Detector',

  async detect(projectRoot: string): Promise<DetectionResult | null> {
    const pkg = readPackageJson(projectRoot);
    if (!pkg) {
      // Still check for CSS Modules even without package.json
      return detectCssModules(projectRoot);
    }

    const deps = getDependencies(pkg);

    // Priority order for styling detection
    // Tailwind is checked first as it's often the primary styling approach
    const detectors = [
      () => detectTailwind(projectRoot, deps),
      () => detectStyledComponents(projectRoot, deps),
      () => detectEmotion(projectRoot, deps),
      () => detectSass(projectRoot, deps),
      () => detectCssModules(projectRoot),
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

    return bestResult;
  },
};

export default stylingDetector;
