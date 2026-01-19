/**
 * Deployment Target Detector
 * Detects: Vercel, Netlify, Railway, Docker
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
 * Detect Vercel deployment
 */
function detectVercel(projectRoot: string, deps: Record<string, string>): DetectionResult | null {
  const evidence: string[] = [];
  let confidence = 0;

  // Check for vercel.json
  const vercelJson = join(projectRoot, 'vercel.json');
  if (existsSync(vercelJson)) {
    evidence.push('vercel.json found');
    confidence += 50;
  }

  // Check for .vercel directory
  const vercelDir = join(projectRoot, '.vercel');
  if (existsSync(vercelDir)) {
    evidence.push('.vercel/ directory found');
    confidence += 30;
  }

  // Check for @vercel/* packages
  const vercelPackages = findMatchingDeps(deps, '@vercel/');
  if (vercelPackages.length > 0) {
    evidence.push(`Vercel packages found: ${vercelPackages.join(', ')}`);
    confidence += 30;
  }

  // Check for vercel CLI
  if (deps.vercel) {
    evidence.push('vercel CLI in devDependencies');
    confidence += 20;
  }

  if (confidence === 0) return null;

  return {
    name: 'Vercel',
    confidence: Math.min(confidence, 100),
    evidence,
  };
}

/**
 * Detect Netlify deployment
 */
function detectNetlify(projectRoot: string, deps: Record<string, string>): DetectionResult | null {
  const evidence: string[] = [];
  let confidence = 0;

  // Check for netlify.toml
  const netlifyToml = join(projectRoot, 'netlify.toml');
  if (existsSync(netlifyToml)) {
    evidence.push('netlify.toml found');
    confidence += 60;
  }

  // Check for .netlify directory
  const netlifyDir = join(projectRoot, '.netlify');
  if (existsSync(netlifyDir)) {
    evidence.push('.netlify/ directory found');
    confidence += 30;
  }

  // Check for netlify-cli
  if (deps['netlify-cli']) {
    evidence.push('netlify-cli in devDependencies');
    confidence += 20;
  }

  // Check for @netlify/* packages
  const netlifyPackages = findMatchingDeps(deps, '@netlify/');
  if (netlifyPackages.length > 0) {
    evidence.push(`Netlify packages found: ${netlifyPackages.join(', ')}`);
    confidence += 20;
  }

  if (confidence === 0) return null;

  return {
    name: 'Netlify',
    confidence: Math.min(confidence, 100),
    evidence,
  };
}

/**
 * Detect Railway deployment
 */
function detectRailway(projectRoot: string): DetectionResult | null {
  const evidence: string[] = [];
  let confidence = 0;

  // Check for railway.json
  const railwayJson = join(projectRoot, 'railway.json');
  if (existsSync(railwayJson)) {
    evidence.push('railway.json found');
    confidence += 70;
  }

  // Check for railway.toml
  const railwayToml = join(projectRoot, 'railway.toml');
  if (existsSync(railwayToml)) {
    evidence.push('railway.toml found');
    confidence += 70;
  }

  if (confidence === 0) return null;

  return {
    name: 'Railway',
    confidence: Math.min(confidence, 100),
    evidence,
  };
}

/**
 * Detect Docker deployment
 */
function detectDocker(projectRoot: string): DetectionResult | null {
  const evidence: string[] = [];
  let confidence = 0;
  let variant: string | undefined;

  // Check for Dockerfile
  const dockerfile = join(projectRoot, 'Dockerfile');
  if (existsSync(dockerfile)) {
    evidence.push('Dockerfile found');
    confidence += 50;
  }

  // Check for docker-compose files
  const composeFiles = [
    'docker-compose.yml',
    'docker-compose.yaml',
    'compose.yml',
    'compose.yaml',
  ];

  for (const file of composeFiles) {
    if (existsSync(join(projectRoot, file))) {
      evidence.push(`${file} found`);
      confidence += 40;
      variant = 'compose';
      break;
    }
  }

  // Check for .dockerignore
  const dockerignore = join(projectRoot, '.dockerignore');
  if (existsSync(dockerignore)) {
    evidence.push('.dockerignore found');
    confidence += 10;
  }

  if (confidence === 0) return null;

  return {
    name: 'Docker',
    variant,
    confidence: Math.min(confidence, 100),
    evidence,
  };
}

/**
 * Detect Fly.io deployment
 */
function detectFly(projectRoot: string): DetectionResult | null {
  const evidence: string[] = [];
  let confidence = 0;

  // Check for fly.toml
  const flyToml = join(projectRoot, 'fly.toml');
  if (existsSync(flyToml)) {
    evidence.push('fly.toml found');
    confidence += 80;
  }

  if (confidence === 0) return null;

  return {
    name: 'Fly.io',
    confidence: Math.min(confidence, 100),
    evidence,
  };
}

/**
 * Detect Render deployment
 */
function detectRender(projectRoot: string): DetectionResult | null {
  const evidence: string[] = [];
  let confidence = 0;

  // Check for render.yaml
  const renderYaml = join(projectRoot, 'render.yaml');
  if (existsSync(renderYaml)) {
    evidence.push('render.yaml found');
    confidence += 80;
  }

  if (confidence === 0) return null;

  return {
    name: 'Render',
    confidence: Math.min(confidence, 100),
    evidence,
  };
}

/**
 * Detect AWS deployment
 */
function detectAWS(projectRoot: string, deps: Record<string, string>): DetectionResult | null {
  const evidence: string[] = [];
  let confidence = 0;
  let variant: string | undefined;

  // Check for AWS SAM template
  const samTemplate = join(projectRoot, 'template.yaml');
  if (existsSync(samTemplate)) {
    try {
      const content = readFileSync(samTemplate, 'utf-8');
      if (content.includes('AWS::Serverless') || content.includes('AWSTemplateFormatVersion')) {
        evidence.push('AWS SAM template.yaml found');
        confidence += 70;
        variant = 'sam';
      }
    } catch {
      // Ignore read errors
    }
  }

  // Check for serverless.yml (Serverless Framework)
  const serverlessYml = join(projectRoot, 'serverless.yml');
  const serverlessYaml = join(projectRoot, 'serverless.yaml');
  if (existsSync(serverlessYml) || existsSync(serverlessYaml)) {
    evidence.push('serverless.yml found');
    confidence += 60;
    variant = 'serverless-framework';
  }

  // Check for AWS CDK
  if (deps['aws-cdk-lib'] || deps['@aws-cdk/core']) {
    evidence.push('AWS CDK detected');
    confidence += 60;
    variant = 'cdk';
  }

  // Check for SST
  if (deps.sst) {
    evidence.push(`sst@${deps.sst} in dependencies`);
    confidence += 70;
    variant = 'sst';
  }

  if (confidence === 0) return null;

  return {
    name: 'AWS',
    variant,
    confidence: Math.min(confidence, 100),
    evidence,
  };
}

/**
 * Deployment target detector
 * Returns all detected deployment targets (projects can deploy to multiple)
 */
export const deploymentDetector: Detector = {
  category: 'deployment',
  name: 'Deployment Target Detector',

  async detect(projectRoot: string): Promise<DetectionResult[] | null> {
    const pkg = readPackageJson(projectRoot);
    const deps = pkg ? getDependencies(pkg) : {};
    const results: DetectionResult[] = [];

    const detectors = [
      () => detectVercel(projectRoot, deps),
      () => detectNetlify(projectRoot, deps),
      () => detectRailway(projectRoot),
      () => detectDocker(projectRoot),
      () => detectFly(projectRoot),
      () => detectRender(projectRoot),
      () => detectAWS(projectRoot, deps),
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

export default deploymentDetector;
