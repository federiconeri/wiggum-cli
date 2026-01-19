/**
 * Framework Detector
 * Detects web frameworks: Next.js, React, Vue, Svelte, Remix, Astro
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { Detector, DetectionResult } from '../../types.js';
import {
  readPackageJson,
  getDependencies,
  findConfigFile,
  type DependencyMap,
} from '../utils.js';

/**
 * Detect Next.js variant (app router vs pages router)
 */
function detectNextJsVariant(projectRoot: string): string | undefined {
  const appDir = join(projectRoot, 'app');
  const srcAppDir = join(projectRoot, 'src', 'app');

  if (existsSync(appDir) || existsSync(srcAppDir)) {
    return 'app-router';
  }

  const pagesDir = join(projectRoot, 'pages');
  const srcPagesDir = join(projectRoot, 'src', 'pages');

  if (existsSync(pagesDir) || existsSync(srcPagesDir)) {
    return 'pages-router';
  }

  return undefined;
}

/**
 * Detect Next.js
 */
function detectNextJs(projectRoot: string, deps: DependencyMap): DetectionResult | null {
  const evidence: string[] = [];
  let confidence = 0;

  // Check for next dependency
  if (deps.next) {
    evidence.push(`next@${deps.next} in dependencies`);
    confidence += 60;
  }

  // Check for next.config.* files
  const configExtensions = ['.js', '.mjs', '.ts'];
  const configFile = findConfigFile(projectRoot, 'next.config', configExtensions);
  if (configFile) {
    evidence.push(`${configFile} found`);
    confidence += 30;
  }

  if (confidence === 0) return null;

  const variant = detectNextJsVariant(projectRoot);
  if (variant) {
    evidence.push(`${variant} detected`);
    confidence += 10;
  }

  return {
    name: 'Next.js',
    version: deps.next,
    variant,
    confidence: Math.min(confidence, 100),
    evidence,
  };
}

/**
 * Detect Vue/Nuxt
 */
function detectVue(projectRoot: string, deps: DependencyMap): DetectionResult | null {
  const evidence: string[] = [];
  let confidence = 0;

  // Check for nuxt (takes precedence as it includes Vue)
  if (deps.nuxt) {
    evidence.push(`nuxt@${deps.nuxt} in dependencies`);
    confidence += 70;

    const nuxtConfig = findConfigFile(projectRoot, 'nuxt.config', ['.js', '.ts']);
    if (nuxtConfig) {
      evidence.push(`${nuxtConfig} found`);
      confidence += 30;
    }

    return {
      name: 'Nuxt',
      version: deps.nuxt,
      confidence: Math.min(confidence, 100),
      evidence,
    };
  }

  // Check for vue
  if (deps.vue) {
    evidence.push(`vue@${deps.vue} in dependencies`);
    confidence += 50;

    // Check for Vue-specific configs
    const vueConfig = findConfigFile(projectRoot, 'vue.config', ['.js', '.ts']);
    if (vueConfig) {
      evidence.push(`${vueConfig} found`);
      confidence += 20;
    }

    const viteConfig = findConfigFile(projectRoot, 'vite.config', ['.js', '.ts', '.mjs']);
    if (viteConfig && deps['@vitejs/plugin-vue']) {
      evidence.push('Vite + Vue plugin detected');
      confidence += 20;
    }

    if (confidence === 0) return null;

    return {
      name: 'Vue',
      version: deps.vue,
      confidence: Math.min(confidence, 100),
      evidence,
    };
  }

  return null;
}

/**
 * Detect Svelte/SvelteKit
 */
function detectSvelte(projectRoot: string, deps: DependencyMap): DetectionResult | null {
  const evidence: string[] = [];
  let confidence = 0;

  // Check for SvelteKit (takes precedence)
  if (deps['@sveltejs/kit']) {
    evidence.push(`@sveltejs/kit@${deps['@sveltejs/kit']} in dependencies`);
    confidence += 70;

    const svelteConfig = findConfigFile(projectRoot, 'svelte.config', ['.js', '.ts']);
    if (svelteConfig) {
      evidence.push(`${svelteConfig} found`);
      confidence += 30;
    }

    return {
      name: 'SvelteKit',
      version: deps['@sveltejs/kit'],
      confidence: Math.min(confidence, 100),
      evidence,
    };
  }

  // Check for Svelte
  if (deps.svelte) {
    evidence.push(`svelte@${deps.svelte} in dependencies`);
    confidence += 50;

    const svelteConfig = findConfigFile(projectRoot, 'svelte.config', ['.js', '.ts']);
    if (svelteConfig) {
      evidence.push(`${svelteConfig} found`);
      confidence += 30;
    }

    if (confidence === 0) return null;

    return {
      name: 'Svelte',
      version: deps.svelte,
      confidence: Math.min(confidence, 100),
      evidence,
    };
  }

  return null;
}

/**
 * Detect Remix
 */
function detectRemix(projectRoot: string, deps: DependencyMap): DetectionResult | null {
  const evidence: string[] = [];
  let confidence = 0;

  if (deps['@remix-run/react'] || deps['@remix-run/node']) {
    const version = deps['@remix-run/react'] || deps['@remix-run/node'];
    evidence.push(`@remix-run packages@${version} in dependencies`);
    confidence += 70;

    // Check for remix config
    const remixConfig = findConfigFile(projectRoot, 'remix.config', ['.js', '.ts']);
    if (remixConfig) {
      evidence.push(`${remixConfig} found`);
      confidence += 20;
    }

    // Remix v2+ uses vite
    const viteConfig = findConfigFile(projectRoot, 'vite.config', ['.js', '.ts', '.mjs']);
    if (viteConfig && deps['@remix-run/dev']) {
      evidence.push('Vite-based Remix setup detected');
      confidence += 10;
    }

    return {
      name: 'Remix',
      version,
      confidence: Math.min(confidence, 100),
      evidence,
    };
  }

  return null;
}

/**
 * Detect Astro
 */
function detectAstro(projectRoot: string, deps: DependencyMap): DetectionResult | null {
  const evidence: string[] = [];
  let confidence = 0;

  if (deps.astro) {
    evidence.push(`astro@${deps.astro} in dependencies`);
    confidence += 60;

    const astroConfig = findConfigFile(projectRoot, 'astro.config', ['.mjs', '.js', '.ts']);
    if (astroConfig) {
      evidence.push(`${astroConfig} found`);
      confidence += 30;
    }

    return {
      name: 'Astro',
      version: deps.astro,
      confidence: Math.min(confidence, 100),
      evidence,
    };
  }

  return null;
}

/**
 * Detect plain React (no framework)
 */
function detectReact(projectRoot: string, deps: DependencyMap): DetectionResult | null {
  const evidence: string[] = [];
  let confidence = 0;

  if (deps.react) {
    evidence.push(`react@${deps.react} in dependencies`);
    confidence += 40;

    // Check for common React setups
    if (deps['react-scripts']) {
      evidence.push('Create React App detected (react-scripts)');
      confidence += 40;
      return {
        name: 'React',
        version: deps.react,
        variant: 'create-react-app',
        confidence: Math.min(confidence, 100),
        evidence,
      };
    }

    // Vite + React
    if (deps['@vitejs/plugin-react'] || deps['@vitejs/plugin-react-swc']) {
      evidence.push('Vite + React setup detected');
      confidence += 30;
      return {
        name: 'React',
        version: deps.react,
        variant: 'vite',
        confidence: Math.min(confidence, 100),
        evidence,
      };
    }

    // Plain React
    return {
      name: 'React',
      version: deps.react,
      confidence: Math.min(confidence, 100),
      evidence,
    };
  }

  return null;
}

/**
 * Framework detector
 */
export const frameworkDetector: Detector = {
  category: 'framework',
  name: 'Framework Detector',

  async detect(projectRoot: string): Promise<DetectionResult | null> {
    const pkg = readPackageJson(projectRoot);
    if (!pkg) {
      return null;
    }

    const deps = getDependencies(pkg);

    // Order matters: check meta-frameworks first, then base frameworks
    const detectors = [
      detectNextJs,
      detectRemix,
      detectAstro,
      detectVue, // Also handles Nuxt
      detectSvelte, // Also handles SvelteKit
      detectReact, // Check React last as it's often a dependency of frameworks
    ];

    for (const detector of detectors) {
      const result = detector(projectRoot, deps);
      if (result && result.confidence >= 40) {
        return result;
      }
    }

    return null;
  },
};

export default frameworkDetector;
