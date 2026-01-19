/**
 * Email Provider Detector
 * Detects: Resend, SendGrid, Nodemailer
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
 * Detect Resend
 */
function detectResend(deps: Record<string, string>): DetectionResult | null {
  const evidence: string[] = [];
  let confidence = 0;

  if (deps.resend) {
    evidence.push(`resend@${deps.resend} in dependencies`);
    confidence += 80;
  }

  // Check for react-email (often used with Resend)
  if (deps['react-email'] || deps['@react-email/components']) {
    evidence.push('React Email detected (commonly paired with Resend)');
    confidence += 10;
  }

  if (confidence === 0) return null;

  return {
    name: 'Resend',
    version: deps.resend,
    confidence: Math.min(confidence, 100),
    evidence,
  };
}

/**
 * Detect SendGrid
 */
function detectSendGrid(deps: Record<string, string>): DetectionResult | null {
  const evidence: string[] = [];
  let confidence = 0;

  // Check for @sendgrid/mail
  if (deps['@sendgrid/mail']) {
    evidence.push(`@sendgrid/mail@${deps['@sendgrid/mail']} in dependencies`);
    confidence += 80;
  }

  // Check for other SendGrid packages
  const sendgridPackages = findMatchingDeps(deps, '@sendgrid/');
  if (sendgridPackages.length > 1) {
    evidence.push(`Multiple SendGrid packages found: ${sendgridPackages.join(', ')}`);
    confidence += 10;
  }

  if (confidence === 0) return null;

  return {
    name: 'SendGrid',
    version: deps['@sendgrid/mail'],
    confidence: Math.min(confidence, 100),
    evidence,
  };
}

/**
 * Detect Nodemailer
 */
function detectNodemailer(deps: Record<string, string>): DetectionResult | null {
  const evidence: string[] = [];
  let confidence = 0;

  if (deps.nodemailer) {
    evidence.push(`nodemailer@${deps.nodemailer} in dependencies`);
    confidence += 80;
  }

  // Check for nodemailer types
  if (deps['@types/nodemailer']) {
    evidence.push('@types/nodemailer found');
    confidence += 10;
  }

  if (confidence === 0) return null;

  return {
    name: 'Nodemailer',
    version: deps.nodemailer,
    confidence: Math.min(confidence, 100),
    evidence,
  };
}

/**
 * Detect Postmark
 */
function detectPostmark(deps: Record<string, string>): DetectionResult | null {
  const evidence: string[] = [];
  let confidence = 0;

  if (deps.postmark) {
    evidence.push(`postmark@${deps.postmark} in dependencies`);
    confidence += 80;
  }

  if (confidence === 0) return null;

  return {
    name: 'Postmark',
    version: deps.postmark,
    confidence: Math.min(confidence, 100),
    evidence,
  };
}

/**
 * Detect Mailgun
 */
function detectMailgun(deps: Record<string, string>): DetectionResult | null {
  const evidence: string[] = [];
  let confidence = 0;

  if (deps['mailgun.js'] || deps['mailgun-js']) {
    const version = deps['mailgun.js'] || deps['mailgun-js'];
    evidence.push(`Mailgun package@${version} in dependencies`);
    confidence += 80;
  }

  if (confidence === 0) return null;

  return {
    name: 'Mailgun',
    version: deps['mailgun.js'] || deps['mailgun-js'],
    confidence: Math.min(confidence, 100),
    evidence,
  };
}

/**
 * Detect AWS SES
 */
function detectAWSSES(deps: Record<string, string>): DetectionResult | null {
  const evidence: string[] = [];
  let confidence = 0;

  // Check for AWS SDK v3 SES client
  if (deps['@aws-sdk/client-ses']) {
    evidence.push(`@aws-sdk/client-ses@${deps['@aws-sdk/client-ses']} in dependencies`);
    confidence += 80;
  }

  // Check for AWS SDK v2 (legacy, but still used)
  if (deps['aws-sdk'] && !deps['@aws-sdk/client-ses']) {
    evidence.push('aws-sdk found (may include SES)');
    confidence += 40; // Lower confidence since we can't confirm SES usage
  }

  if (confidence === 0) return null;

  return {
    name: 'AWS SES',
    version: deps['@aws-sdk/client-ses'],
    confidence: Math.min(confidence, 100),
    evidence,
  };
}

/**
 * Email provider detector
 * Returns the primary email provider detected
 */
export const emailDetector: Detector = {
  category: 'email',
  name: 'Email Provider Detector',

  async detect(projectRoot: string): Promise<DetectionResult | null> {
    const pkg = readPackageJson(projectRoot);
    if (!pkg) {
      return null;
    }

    const deps = getDependencies(pkg);

    // Priority order based on modern usage patterns
    const detectors = [
      () => detectResend(deps),
      () => detectSendGrid(deps),
      () => detectPostmark(deps),
      () => detectMailgun(deps),
      () => detectAWSSES(deps),
      () => detectNodemailer(deps), // Last as it's often a transport, not a provider
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

export default emailDetector;
