/**
 * ORM Detector
 * Detects ORMs: Prisma, Drizzle
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
 * Detect Prisma
 */
function detectPrisma(projectRoot: string, deps: Record<string, string>): DetectionResult | null {
  const evidence: string[] = [];
  let confidence = 0;

  // Check for @prisma/client
  if (deps['@prisma/client']) {
    evidence.push(`@prisma/client@${deps['@prisma/client']} in dependencies`);
    confidence += 50;
  }

  // Check for prisma CLI
  if (deps.prisma) {
    evidence.push(`prisma@${deps.prisma} in devDependencies`);
    confidence += 30;
  }

  // Check for prisma schema file
  const schemaPath = join(projectRoot, 'prisma', 'schema.prisma');
  if (existsSync(schemaPath)) {
    evidence.push('prisma/schema.prisma found');
    confidence += 30;
  }

  // Also check for schema in root (less common but valid)
  const rootSchema = join(projectRoot, 'schema.prisma');
  if (existsSync(rootSchema)) {
    evidence.push('schema.prisma found in root');
    confidence += 20;
  }

  if (confidence === 0) return null;

  return {
    name: 'Prisma',
    version: deps['@prisma/client'] || deps.prisma,
    confidence: Math.min(confidence, 100),
    evidence,
  };
}

/**
 * Detect Drizzle ORM
 */
function detectDrizzle(projectRoot: string, deps: Record<string, string>): DetectionResult | null {
  const evidence: string[] = [];
  let confidence = 0;

  // Check for drizzle-orm
  if (deps['drizzle-orm']) {
    evidence.push(`drizzle-orm@${deps['drizzle-orm']} in dependencies`);
    confidence += 60;
  }

  // Check for drizzle-kit (migration tool)
  if (deps['drizzle-kit']) {
    evidence.push(`drizzle-kit@${deps['drizzle-kit']} in dependencies`);
    confidence += 20;
  }

  // Check for drizzle config file
  const configExtensions = ['.config.ts', '.config.js', '.config.mjs'];
  const configFile = findConfigFile(projectRoot, 'drizzle', configExtensions);
  if (configFile) {
    evidence.push(`${configFile} found`);
    confidence += 20;
  }

  // Detect database adapter
  let variant: string | undefined;
  if (deps['@planetscale/database'] || deps['drizzle-orm/planetscale-serverless']) {
    variant = 'planetscale';
  } else if (deps['@neondatabase/serverless']) {
    variant = 'neon';
  } else if (deps['@libsql/client'] || deps['better-sqlite3']) {
    variant = 'sqlite';
  } else if (deps.pg || deps.postgres) {
    variant = 'postgres';
  } else if (deps.mysql2) {
    variant = 'mysql';
  }

  if (confidence === 0) return null;

  return {
    name: 'Drizzle',
    version: deps['drizzle-orm'],
    variant,
    confidence: Math.min(confidence, 100),
    evidence,
  };
}

/**
 * ORM detector
 * Returns the primary ORM detected
 */
export const ormDetector: Detector = {
  category: 'orm',
  name: 'ORM Detector',

  async detect(projectRoot: string): Promise<DetectionResult | null> {
    const pkg = readPackageJson(projectRoot);
    if (!pkg) {
      return null;
    }

    const deps = getDependencies(pkg);

    // Check both ORMs and return the one with higher confidence
    const prisma = detectPrisma(projectRoot, deps);
    const drizzle = detectDrizzle(projectRoot, deps);

    // Return the one with higher confidence, or first one if equal
    if (prisma && drizzle) {
      return prisma.confidence >= drizzle.confidence ? prisma : drizzle;
    }

    if (prisma && prisma.confidence >= 40) {
      return prisma;
    }

    if (drizzle && drizzle.confidence >= 40) {
      return drizzle;
    }

    return null;
  },
};

export default ormDetector;
