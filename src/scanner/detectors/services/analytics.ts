/**
 * Analytics Detector
 * Detects: PostHog, Mixpanel, Vercel Analytics, Google Analytics
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
 * Detect PostHog
 */
function detectPostHog(deps: Record<string, string>): DetectionResult | null {
  const evidence: string[] = [];
  let confidence = 0;
  let variant: string | undefined;

  // Check for posthog-js (browser)
  if (deps['posthog-js']) {
    evidence.push(`posthog-js@${deps['posthog-js']} in dependencies`);
    confidence += 80;
    variant = 'browser';
  }

  // Check for posthog-node (server)
  if (deps['posthog-node']) {
    evidence.push(`posthog-node@${deps['posthog-node']} in dependencies`);
    confidence += 80;
    variant = variant ? 'full-stack' : 'server';
  }

  // Check for Next.js specific package
  if (deps['posthog-react']) {
    evidence.push('posthog-react found');
    confidence += 10;
  }

  if (confidence === 0) return null;

  return {
    name: 'PostHog',
    version: deps['posthog-js'] || deps['posthog-node'],
    variant,
    confidence: Math.min(confidence, 100),
    evidence,
  };
}

/**
 * Detect Mixpanel
 */
function detectMixpanel(deps: Record<string, string>): DetectionResult | null {
  const evidence: string[] = [];
  let confidence = 0;

  // Check for mixpanel packages
  const mixpanelPackages = findMatchingDeps(deps, 'mixpanel');
  if (mixpanelPackages.length > 0) {
    evidence.push(`Mixpanel packages found: ${mixpanelPackages.join(', ')}`);
    confidence += 80;
  }

  // Check for @mixpanel/* packages
  const mixpanelScopedPackages = findMatchingDeps(deps, '@mixpanel/');
  if (mixpanelScopedPackages.length > 0) {
    evidence.push(`@mixpanel packages found: ${mixpanelScopedPackages.join(', ')}`);
    confidence += 80;
  }

  if (confidence === 0) return null;

  return {
    name: 'Mixpanel',
    version: deps.mixpanel || deps['mixpanel-browser'],
    confidence: Math.min(confidence, 100),
    evidence,
  };
}

/**
 * Detect Vercel Analytics
 */
function detectVercelAnalytics(deps: Record<string, string>): DetectionResult | null {
  const evidence: string[] = [];
  let confidence = 0;

  if (deps['@vercel/analytics']) {
    evidence.push(`@vercel/analytics@${deps['@vercel/analytics']} in dependencies`);
    confidence += 80;
  }

  // Check for @vercel/speed-insights (often used together)
  if (deps['@vercel/speed-insights']) {
    evidence.push('@vercel/speed-insights found');
    confidence += 10;
  }

  if (confidence === 0) return null;

  return {
    name: 'Vercel Analytics',
    version: deps['@vercel/analytics'],
    confidence: Math.min(confidence, 100),
    evidence,
  };
}

/**
 * Detect Google Analytics
 */
function detectGoogleAnalytics(deps: Record<string, string>): DetectionResult | null {
  const evidence: string[] = [];
  let confidence = 0;

  // Check for various GA packages
  if (deps['@google-analytics/data']) {
    evidence.push('@google-analytics/data found');
    confidence += 70;
  }

  if (deps['react-ga4'] || deps['react-ga']) {
    evidence.push('React GA package found');
    confidence += 70;
  }

  if (deps['ga-4-react']) {
    evidence.push('ga-4-react found');
    confidence += 70;
  }

  // Check for gtag
  if (deps.gtag) {
    evidence.push('gtag found');
    confidence += 60;
  }

  if (confidence === 0) return null;

  return {
    name: 'Google Analytics',
    version: deps['react-ga4'] || deps['@google-analytics/data'],
    confidence: Math.min(confidence, 100),
    evidence,
  };
}

/**
 * Detect Amplitude
 */
function detectAmplitude(deps: Record<string, string>): DetectionResult | null {
  const evidence: string[] = [];
  let confidence = 0;

  // Check for @amplitude/* packages
  const amplitudePackages = findMatchingDeps(deps, '@amplitude/');
  if (amplitudePackages.length > 0) {
    evidence.push(`Amplitude packages found: ${amplitudePackages.join(', ')}`);
    confidence += 80;
  }

  // Check for amplitude-js
  if (deps['amplitude-js']) {
    evidence.push(`amplitude-js@${deps['amplitude-js']} in dependencies`);
    confidence += 80;
  }

  if (confidence === 0) return null;

  return {
    name: 'Amplitude',
    version: deps['@amplitude/analytics-browser'] || deps['amplitude-js'],
    confidence: Math.min(confidence, 100),
    evidence,
  };
}

/**
 * Detect Plausible
 */
function detectPlausible(deps: Record<string, string>): DetectionResult | null {
  const evidence: string[] = [];
  let confidence = 0;

  if (deps['plausible-tracker']) {
    evidence.push(`plausible-tracker@${deps['plausible-tracker']} in dependencies`);
    confidence += 80;
  }

  if (deps['next-plausible']) {
    evidence.push('next-plausible found');
    confidence += 80;
  }

  if (confidence === 0) return null;

  return {
    name: 'Plausible',
    version: deps['plausible-tracker'] || deps['next-plausible'],
    confidence: Math.min(confidence, 100),
    evidence,
  };
}

/**
 * Analytics detector
 * Returns all detected analytics solutions (projects often use multiple)
 */
export const analyticsDetector: Detector = {
  category: 'analytics',
  name: 'Analytics Detector',

  async detect(projectRoot: string): Promise<DetectionResult[] | null> {
    const pkg = readPackageJson(projectRoot);
    if (!pkg) {
      return null;
    }

    const deps = getDependencies(pkg);
    const results: DetectionResult[] = [];

    const detectors = [
      () => detectPostHog(deps),
      () => detectMixpanel(deps),
      () => detectVercelAnalytics(deps),
      () => detectGoogleAnalytics(deps),
      () => detectAmplitude(deps),
      () => detectPlausible(deps),
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

export default analyticsDetector;
