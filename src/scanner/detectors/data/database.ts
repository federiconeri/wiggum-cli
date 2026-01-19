/**
 * Database Detector
 * Detects databases: Supabase, Firebase, MongoDB, PostgreSQL
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
 * Check if any dependency matches a pattern
 */
function hasDependencyPattern(deps: Record<string, string>, pattern: string): string | undefined {
  for (const [name, version] of Object.entries(deps)) {
    if (name.startsWith(pattern) || name === pattern) {
      return version;
    }
  }
  return undefined;
}

/**
 * Find all matching dependencies by pattern
 */
function findMatchingDeps(deps: Record<string, string>, pattern: string): string[] {
  return Object.keys(deps).filter(name => name.startsWith(pattern) || name === pattern);
}

/**
 * Detect Supabase
 */
function detectSupabase(projectRoot: string, deps: Record<string, string>): DetectionResult | null {
  const evidence: string[] = [];
  let confidence = 0;

  // Check for @supabase/* packages
  if (deps['@supabase/supabase-js']) {
    evidence.push(`@supabase/supabase-js@${deps['@supabase/supabase-js']} in dependencies`);
    confidence += 70;
  }

  const supabasePackages = findMatchingDeps(deps, '@supabase/');
  if (supabasePackages.length > 1) {
    evidence.push(`Multiple @supabase packages found: ${supabasePackages.join(', ')}`);
    confidence += 10;
  }

  // Check for supabase directory
  const supabaseDir = join(projectRoot, 'supabase');
  if (existsSync(supabaseDir)) {
    evidence.push('supabase/ directory found');
    confidence += 20;
  }

  // Check for supabase config
  const configPath = join(supabaseDir, 'config.toml');
  if (existsSync(configPath)) {
    evidence.push('supabase/config.toml found');
    confidence += 10;
  }

  if (confidence === 0) return null;

  return {
    name: 'Supabase',
    version: deps['@supabase/supabase-js'],
    confidence: Math.min(confidence, 100),
    evidence,
  };
}

/**
 * Detect Firebase
 */
function detectFirebase(projectRoot: string, deps: Record<string, string>): DetectionResult | null {
  const evidence: string[] = [];
  let confidence = 0;

  // Check for firebase package
  if (deps.firebase) {
    evidence.push(`firebase@${deps.firebase} in dependencies`);
    confidence += 70;
  }

  // Check for @firebase/* packages
  const firebasePackages = findMatchingDeps(deps, '@firebase/');
  if (firebasePackages.length > 0) {
    evidence.push(`Firebase packages found: ${firebasePackages.slice(0, 3).join(', ')}${firebasePackages.length > 3 ? '...' : ''}`);
    confidence += 20;
  }

  // Check for firebase admin
  if (deps['firebase-admin']) {
    evidence.push(`firebase-admin@${deps['firebase-admin']} in dependencies`);
    confidence += 20;
  }

  // Check for firebase.json config
  const firebaseConfig = join(projectRoot, 'firebase.json');
  if (existsSync(firebaseConfig)) {
    evidence.push('firebase.json found');
    confidence += 10;
  }

  if (confidence === 0) return null;

  return {
    name: 'Firebase',
    version: deps.firebase || deps['firebase-admin'],
    confidence: Math.min(confidence, 100),
    evidence,
  };
}

/**
 * Detect MongoDB (via mongoose or mongodb driver)
 */
function detectMongoDB(projectRoot: string, deps: Record<string, string>): DetectionResult | null {
  const evidence: string[] = [];
  let confidence = 0;

  // Check for mongoose (ODM)
  if (deps.mongoose) {
    evidence.push(`mongoose@${deps.mongoose} in dependencies`);
    confidence += 80;
    return {
      name: 'MongoDB',
      version: deps.mongoose,
      variant: 'mongoose',
      confidence: Math.min(confidence, 100),
      evidence,
    };
  }

  // Check for native mongodb driver
  if (deps.mongodb) {
    evidence.push(`mongodb@${deps.mongodb} in dependencies`);
    confidence += 80;
    return {
      name: 'MongoDB',
      version: deps.mongodb,
      variant: 'native-driver',
      confidence: Math.min(confidence, 100),
      evidence,
    };
  }

  return null;
}

/**
 * Detect PostgreSQL
 */
function detectPostgreSQL(projectRoot: string, deps: Record<string, string>): DetectionResult | null {
  const evidence: string[] = [];
  let confidence = 0;

  // Check for pg (node-postgres)
  if (deps.pg) {
    evidence.push(`pg@${deps.pg} in dependencies`);
    confidence += 70;
  }

  // Check for postgres (modern driver)
  if (deps.postgres) {
    evidence.push(`postgres@${deps.postgres} in dependencies`);
    confidence += 70;
  }

  // Note: Supabase and Prisma also use Postgres, but they're separate categories
  // This detector is for direct Postgres usage

  if (confidence === 0) return null;

  return {
    name: 'PostgreSQL',
    version: deps.pg || deps.postgres,
    variant: deps.pg ? 'node-postgres' : 'postgres.js',
    confidence: Math.min(confidence, 100),
    evidence,
  };
}

/**
 * Database detector
 * Returns the primary database detected
 */
export const databaseDetector: Detector = {
  category: 'database',
  name: 'Database Detector',

  async detect(projectRoot: string): Promise<DetectionResult | null> {
    const pkg = readPackageJson(projectRoot);
    if (!pkg) {
      return null;
    }

    const deps = getDependencies(pkg);

    // Priority: Supabase > Firebase > MongoDB > PostgreSQL
    // (BaaS solutions take precedence as they encompass more)
    const detectors = [
      () => detectSupabase(projectRoot, deps),
      () => detectFirebase(projectRoot, deps),
      () => detectMongoDB(projectRoot, deps),
      () => detectPostgreSQL(projectRoot, deps),
    ];

    for (const detector of detectors) {
      const result = detector();
      if (result && result.confidence >= 40) {
        return result;
      }
    }

    return null;
  },
};

export default databaseDetector;
