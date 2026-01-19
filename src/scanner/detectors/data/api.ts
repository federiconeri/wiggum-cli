/**
 * API Pattern Detector
 * Detects: tRPC, GraphQL, TanStack Query, REST patterns
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
 * Find all matching dependencies by pattern
 */
function findMatchingDeps(deps: Record<string, string>, pattern: string): string[] {
  return Object.keys(deps).filter(name => name.startsWith(pattern) || name === pattern);
}

/**
 * Detect tRPC
 */
function detectTRPC(projectRoot: string, deps: Record<string, string>): DetectionResult | null {
  const evidence: string[] = [];
  let confidence = 0;

  // Check for @trpc/* packages
  const trpcPackages = findMatchingDeps(deps, '@trpc/');
  if (trpcPackages.length > 0) {
    const mainVersion = deps['@trpc/server'] || deps['@trpc/client'];
    evidence.push(`tRPC packages found: ${trpcPackages.join(', ')}`);
    confidence += 70;

    // Check for specific packages
    if (deps['@trpc/server'] && deps['@trpc/client']) {
      confidence += 20;
    }
    if (deps['@trpc/react-query'] || deps['@trpc/next']) {
      evidence.push('tRPC React/Next integration detected');
      confidence += 10;
    }

    return {
      name: 'tRPC',
      version: mainVersion,
      confidence: Math.min(confidence, 100),
      evidence,
    };
  }

  return null;
}

/**
 * Detect GraphQL
 */
function detectGraphQL(projectRoot: string, deps: Record<string, string>): DetectionResult | null {
  const evidence: string[] = [];
  let confidence = 0;

  // Check for graphql package
  if (deps.graphql) {
    evidence.push(`graphql@${deps.graphql} in dependencies`);
    confidence += 40;
  }

  // Check for Apollo packages
  const apolloPackages = findMatchingDeps(deps, '@apollo/');
  if (apolloPackages.length > 0) {
    evidence.push(`Apollo packages found: ${apolloPackages.join(', ')}`);
    confidence += 40;

    return {
      name: 'GraphQL',
      version: deps.graphql,
      variant: 'apollo',
      confidence: Math.min(confidence, 100),
      evidence,
    };
  }

  // Check for urql
  if (deps.urql || deps['@urql/core']) {
    evidence.push('urql client detected');
    confidence += 40;

    return {
      name: 'GraphQL',
      version: deps.graphql,
      variant: 'urql',
      confidence: Math.min(confidence, 100),
      evidence,
    };
  }

  // Check for relay
  if (deps['react-relay'] || deps['relay-runtime']) {
    evidence.push('Relay detected');
    confidence += 40;

    return {
      name: 'GraphQL',
      version: deps.graphql,
      variant: 'relay',
      confidence: Math.min(confidence, 100),
      evidence,
    };
  }

  // Check for schema files
  const schemaFiles = ['schema.graphql', 'schema.gql'];
  for (const file of schemaFiles) {
    if (existsSync(join(projectRoot, file))) {
      evidence.push(`${file} found`);
      confidence += 20;
    }
  }

  if (confidence === 0) return null;

  return {
    name: 'GraphQL',
    version: deps.graphql,
    confidence: Math.min(confidence, 100),
    evidence,
  };
}

/**
 * Detect TanStack Query (React Query, Vue Query)
 */
function detectTanStackQuery(projectRoot: string, deps: Record<string, string>): DetectionResult | null {
  const evidence: string[] = [];
  let confidence = 0;
  let variant: string | undefined;

  // Check for @tanstack/react-query
  if (deps['@tanstack/react-query']) {
    evidence.push(`@tanstack/react-query@${deps['@tanstack/react-query']} in dependencies`);
    confidence += 80;
    variant = 'react';
  }

  // Check for @tanstack/vue-query
  if (deps['@tanstack/vue-query']) {
    evidence.push(`@tanstack/vue-query@${deps['@tanstack/vue-query']} in dependencies`);
    confidence += 80;
    variant = 'vue';
  }

  // Check for @tanstack/svelte-query
  if (deps['@tanstack/svelte-query']) {
    evidence.push(`@tanstack/svelte-query@${deps['@tanstack/svelte-query']} in dependencies`);
    confidence += 80;
    variant = 'svelte';
  }

  // Check for old react-query package (v3)
  if (deps['react-query']) {
    evidence.push(`react-query@${deps['react-query']} in dependencies (legacy)`);
    confidence += 70;
    variant = 'react-legacy';
  }

  // Check for devtools
  if (deps['@tanstack/react-query-devtools'] || deps['@tanstack/vue-query-devtools']) {
    evidence.push('TanStack Query devtools detected');
    confidence += 10;
  }

  if (confidence === 0) return null;

  const version = deps['@tanstack/react-query'] || deps['@tanstack/vue-query'] ||
                  deps['@tanstack/svelte-query'] || deps['react-query'];

  return {
    name: 'TanStack Query',
    version,
    variant,
    confidence: Math.min(confidence, 100),
    evidence,
  };
}

/**
 * Detect REST patterns (axios, fetch wrappers)
 */
function detectREST(projectRoot: string, deps: Record<string, string>): DetectionResult | null {
  const evidence: string[] = [];
  let confidence = 0;
  let variant: string | undefined;

  // Check for axios
  if (deps.axios) {
    evidence.push(`axios@${deps.axios} in dependencies`);
    confidence += 60;
    variant = 'axios';
  }

  // Check for ky (modern fetch wrapper)
  if (deps.ky) {
    evidence.push(`ky@${deps.ky} in dependencies`);
    confidence += 60;
    variant = 'ky';
  }

  // Check for got (Node.js HTTP client)
  if (deps.got) {
    evidence.push(`got@${deps.got} in dependencies`);
    confidence += 50;
    variant = 'got';
  }

  // Check for node-fetch
  if (deps['node-fetch']) {
    evidence.push(`node-fetch@${deps['node-fetch']} in dependencies`);
    confidence += 40;
    variant = 'node-fetch';
  }

  // Check for SWR (while not strictly REST, often used with REST)
  if (deps.swr) {
    evidence.push(`swr@${deps.swr} in dependencies`);
    confidence += 50;
    variant = 'swr';
  }

  if (confidence === 0) return null;

  return {
    name: 'REST',
    version: deps.axios || deps.ky || deps.got || deps['node-fetch'] || deps.swr,
    variant,
    confidence: Math.min(confidence, 100),
    evidence,
  };
}

/**
 * API pattern detector
 * Returns all detected API patterns
 */
export const apiDetector: Detector = {
  category: 'api',
  name: 'API Pattern Detector',

  async detect(projectRoot: string): Promise<DetectionResult[] | null> {
    const pkg = readPackageJson(projectRoot);
    if (!pkg) {
      return null;
    }

    const deps = getDependencies(pkg);
    const results: DetectionResult[] = [];

    // Detect all API patterns (project can use multiple)
    const trpc = detectTRPC(projectRoot, deps);
    if (trpc && trpc.confidence >= 40) {
      results.push(trpc);
    }

    const graphql = detectGraphQL(projectRoot, deps);
    if (graphql && graphql.confidence >= 40) {
      results.push(graphql);
    }

    const tanstack = detectTanStackQuery(projectRoot, deps);
    if (tanstack && tanstack.confidence >= 40) {
      results.push(tanstack);
    }

    const rest = detectREST(projectRoot, deps);
    if (rest && rest.confidence >= 40) {
      results.push(rest);
    }

    return results.length > 0 ? results : null;
  },
};

export default apiDetector;
