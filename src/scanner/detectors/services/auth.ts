/**
 * Auth Provider Detector
 * Detects: NextAuth, Clerk, Auth0, Supabase Auth
 */

import type { Detector, DetectionResult } from '../../types.js';
import {
  readPackageJson,
  getDependencies,
  findMatchingDeps,
  type DependencyMap,
} from '../utils.js';

/**
 * Detect NextAuth.js / Auth.js
 */
function detectNextAuth(deps: DependencyMap): DetectionResult | null {
  const evidence: string[] = [];
  let confidence = 0;
  let variant: string | undefined;

  // Check for next-auth (v4 and below)
  if (deps['next-auth']) {
    evidence.push(`next-auth@${deps['next-auth']} in dependencies`);
    confidence += 80;
    variant = 'v4';
  }

  // Check for @auth/* packages (Auth.js v5+)
  const authPackages = findMatchingDeps(deps, '@auth/');
  if (authPackages.length > 0) {
    evidence.push(`Auth.js packages found: ${authPackages.join(', ')}`);
    confidence += 80;
    variant = 'v5';
  }

  if (confidence === 0) return null;

  return {
    name: 'NextAuth.js',
    version: deps['next-auth'] || deps['@auth/core'],
    variant,
    confidence: Math.min(confidence, 100),
    evidence,
  };
}

/**
 * Detect Clerk
 */
function detectClerk(deps: DependencyMap): DetectionResult | null {
  const evidence: string[] = [];
  let confidence = 0;

  // Check for @clerk/* packages
  const clerkPackages = findMatchingDeps(deps, '@clerk/');
  if (clerkPackages.length > 0) {
    const mainVersion = deps['@clerk/nextjs'] || deps['@clerk/clerk-react'] || deps['@clerk/express'];
    evidence.push(`Clerk packages found: ${clerkPackages.join(', ')}`);
    confidence += 80;

    // Detect framework variant
    let variant: string | undefined;
    if (deps['@clerk/nextjs']) {
      variant = 'nextjs';
    } else if (deps['@clerk/clerk-react']) {
      variant = 'react';
    } else if (deps['@clerk/express']) {
      variant = 'express';
    }

    return {
      name: 'Clerk',
      version: mainVersion,
      variant,
      confidence: Math.min(confidence, 100),
      evidence,
    };
  }

  return null;
}

/**
 * Detect Auth0
 */
function detectAuth0(deps: DependencyMap): DetectionResult | null {
  const evidence: string[] = [];
  let confidence = 0;
  let variant: string | undefined;

  // Check for @auth0/* packages
  const auth0Packages = findMatchingDeps(deps, '@auth0/');
  if (auth0Packages.length > 0) {
    evidence.push(`Auth0 packages found: ${auth0Packages.join(', ')}`);
    confidence += 70;

    if (deps['@auth0/nextjs-auth0']) {
      variant = 'nextjs';
      confidence += 10;
    } else if (deps['@auth0/auth0-react']) {
      variant = 'react';
      confidence += 10;
    }
  }

  // Check for auth0 package
  if (deps.auth0) {
    evidence.push(`auth0@${deps.auth0} in dependencies`);
    confidence += 60;
    variant = 'node';
  }

  if (confidence === 0) return null;

  return {
    name: 'Auth0',
    version: deps['@auth0/nextjs-auth0'] || deps['@auth0/auth0-react'] || deps.auth0,
    variant,
    confidence: Math.min(confidence, 100),
    evidence,
  };
}

/**
 * Detect Supabase Auth
 */
function detectSupabaseAuth(deps: DependencyMap): DetectionResult | null {
  const evidence: string[] = [];
  let confidence = 0;

  // Check for @supabase/auth-helpers-* packages
  const authHelperPackages = findMatchingDeps(deps, '@supabase/auth-helpers-');
  if (authHelperPackages.length > 0) {
    evidence.push(`Supabase auth helpers found: ${authHelperPackages.join(', ')}`);
    confidence += 70;
  }

  // Check for @supabase/ssr (newer auth approach)
  if (deps['@supabase/ssr']) {
    evidence.push(`@supabase/ssr@${deps['@supabase/ssr']} in dependencies`);
    confidence += 70;
  }

  // Check for @supabase/auth-ui-react
  if (deps['@supabase/auth-ui-react']) {
    evidence.push('@supabase/auth-ui-react found');
    confidence += 20;
  }

  if (confidence === 0) return null;

  return {
    name: 'Supabase Auth',
    version: deps['@supabase/ssr'] || authHelperPackages[0] ? deps[authHelperPackages[0]] : undefined,
    confidence: Math.min(confidence, 100),
    evidence,
  };
}

/**
 * Detect Lucia Auth
 */
function detectLucia(deps: DependencyMap): DetectionResult | null {
  const evidence: string[] = [];
  let confidence = 0;

  if (deps.lucia) {
    evidence.push(`lucia@${deps.lucia} in dependencies`);
    confidence += 80;
  }

  // Check for @lucia-auth/* adapters
  const luciaPackages = findMatchingDeps(deps, '@lucia-auth/');
  if (luciaPackages.length > 0) {
    evidence.push(`Lucia adapters found: ${luciaPackages.join(', ')}`);
    confidence += 10;
  }

  if (confidence === 0) return null;

  return {
    name: 'Lucia',
    version: deps.lucia,
    confidence: Math.min(confidence, 100),
    evidence,
  };
}

/**
 * Detect Better Auth
 */
function detectBetterAuth(deps: DependencyMap): DetectionResult | null {
  const evidence: string[] = [];
  let confidence = 0;

  if (deps['better-auth']) {
    evidence.push(`better-auth@${deps['better-auth']} in dependencies`);
    confidence += 80;
  }

  if (confidence === 0) return null;

  return {
    name: 'Better Auth',
    version: deps['better-auth'],
    confidence: Math.min(confidence, 100),
    evidence,
  };
}

/**
 * Auth provider detector
 * Returns the primary auth solution detected
 */
export const authDetector: Detector = {
  category: 'auth',
  name: 'Auth Provider Detector',

  async detect(projectRoot: string): Promise<DetectionResult | null> {
    const pkg = readPackageJson(projectRoot);
    if (!pkg) {
      return null;
    }

    const deps = getDependencies(pkg);

    // Priority order based on popularity/comprehensiveness
    const detectors = [
      () => detectClerk(deps),
      () => detectNextAuth(deps),
      () => detectAuth0(deps),
      () => detectLucia(deps),
      () => detectBetterAuth(deps),
      () => detectSupabaseAuth(deps),
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

export default authDetector;
