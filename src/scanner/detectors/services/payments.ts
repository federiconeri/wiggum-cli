/**
 * Payments Provider Detector
 * Detects: Stripe, Lemon Squeezy, Paddle
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
 * Detect Stripe
 */
function detectStripe(deps: Record<string, string>): DetectionResult | null {
  const evidence: string[] = [];
  let confidence = 0;
  let variant: string | undefined;

  // Check for stripe (Node.js SDK)
  if (deps.stripe) {
    evidence.push(`stripe@${deps.stripe} in dependencies`);
    confidence += 70;
    variant = 'server';
  }

  // Check for @stripe/* packages
  const stripePackages = findMatchingDeps(deps, '@stripe/');
  if (stripePackages.length > 0) {
    evidence.push(`Stripe packages found: ${stripePackages.join(', ')}`);
    confidence += 20;

    if (deps['@stripe/stripe-js']) {
      variant = variant === 'server' ? 'full-stack' : 'client';
    }
    if (deps['@stripe/react-stripe-js']) {
      evidence.push('React Stripe.js integration detected');
      confidence += 10;
    }
  }

  if (confidence === 0) return null;

  return {
    name: 'Stripe',
    version: deps.stripe || deps['@stripe/stripe-js'],
    variant,
    confidence: Math.min(confidence, 100),
    evidence,
  };
}

/**
 * Detect Lemon Squeezy
 */
function detectLemonSqueezy(deps: Record<string, string>): DetectionResult | null {
  const evidence: string[] = [];
  let confidence = 0;

  // Check for @lemonsqueezy/* packages
  const lsPackages = findMatchingDeps(deps, '@lemonsqueezy/');
  if (lsPackages.length > 0) {
    evidence.push(`Lemon Squeezy packages found: ${lsPackages.join(', ')}`);
    confidence += 80;
  }

  // Check for lemonsqueezy.js
  if (deps['lemonsqueezy.js']) {
    evidence.push(`lemonsqueezy.js@${deps['lemonsqueezy.js']} in dependencies`);
    confidence += 80;
  }

  if (confidence === 0) return null;

  return {
    name: 'Lemon Squeezy',
    version: deps['@lemonsqueezy/lemonsqueezy.js'] || deps['lemonsqueezy.js'],
    confidence: Math.min(confidence, 100),
    evidence,
  };
}

/**
 * Detect Paddle
 */
function detectPaddle(deps: Record<string, string>): DetectionResult | null {
  const evidence: string[] = [];
  let confidence = 0;

  // Check for @paddle/* packages
  const paddlePackages = findMatchingDeps(deps, '@paddle/');
  if (paddlePackages.length > 0) {
    evidence.push(`Paddle packages found: ${paddlePackages.join(', ')}`);
    confidence += 80;
  }

  // Check for paddle-sdk
  if (deps['paddle-sdk']) {
    evidence.push(`paddle-sdk@${deps['paddle-sdk']} in dependencies`);
    confidence += 70;
  }

  if (confidence === 0) return null;

  return {
    name: 'Paddle',
    version: deps['@paddle/paddle-js'] || deps['paddle-sdk'],
    confidence: Math.min(confidence, 100),
    evidence,
  };
}

/**
 * Detect PayPal
 */
function detectPayPal(deps: Record<string, string>): DetectionResult | null {
  const evidence: string[] = [];
  let confidence = 0;

  // Check for @paypal/* packages
  const paypalPackages = findMatchingDeps(deps, '@paypal/');
  if (paypalPackages.length > 0) {
    evidence.push(`PayPal packages found: ${paypalPackages.join(', ')}`);
    confidence += 80;
  }

  // Check for paypal-rest-sdk
  if (deps['paypal-rest-sdk']) {
    evidence.push(`paypal-rest-sdk@${deps['paypal-rest-sdk']} in dependencies`);
    confidence += 70;
  }

  if (confidence === 0) return null;

  return {
    name: 'PayPal',
    version: deps['@paypal/paypal-js'] || deps['paypal-rest-sdk'],
    confidence: Math.min(confidence, 100),
    evidence,
  };
}

/**
 * Payments provider detector
 * Returns the primary payment provider detected
 */
export const paymentsDetector: Detector = {
  category: 'payments',
  name: 'Payments Provider Detector',

  async detect(projectRoot: string): Promise<DetectionResult | null> {
    const pkg = readPackageJson(projectRoot);
    if (!pkg) {
      return null;
    }

    const deps = getDependencies(pkg);

    // Priority order based on popularity
    const detectors = [
      () => detectStripe(deps),
      () => detectLemonSqueezy(deps),
      () => detectPaddle(deps),
      () => detectPayPal(deps),
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

export default paymentsDetector;
