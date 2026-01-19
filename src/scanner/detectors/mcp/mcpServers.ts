/**
 * MCP Servers Detector
 * Detects usable MCP tools from config files and infers from dependencies
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
 * Read JSON file safely
 */
function readJsonFile(filePath: string): Record<string, unknown> | null {
  if (!existsSync(filePath)) {
    return null;
  }
  try {
    const content = readFileSync(filePath, 'utf-8');
    return JSON.parse(content);
  } catch {
    return null;
  }
}

/**
 * MCP configuration structure
 */
interface MCPConfig {
  mcpServers?: Record<string, {
    command?: string;
    args?: string[];
    url?: string;
  }>;
}

/**
 * Detect MCP configuration from .claude directory
 */
function detectClaudeMCP(projectRoot: string): DetectionResult[] {
  const results: DetectionResult[] = [];
  const claudeDir = join(projectRoot, '.claude');

  if (!existsSync(claudeDir)) {
    return results;
  }

  // Check for mcp.json in .claude directory
  const mcpConfigPath = join(claudeDir, 'mcp.json');
  const config = readJsonFile(mcpConfigPath) as MCPConfig | null;

  if (config?.mcpServers) {
    for (const [name, serverConfig] of Object.entries(config.mcpServers)) {
      results.push({
        name: `MCP: ${name}`,
        confidence: 90,
        evidence: [`Configured in .claude/mcp.json`],
        variant: serverConfig.command || serverConfig.url || 'configured',
      });
    }
  }

  return results;
}

/**
 * Detect MCP configuration from .cursor directory
 */
function detectCursorMCP(projectRoot: string): DetectionResult[] {
  const results: DetectionResult[] = [];
  const cursorDir = join(projectRoot, '.cursor');

  if (!existsSync(cursorDir)) {
    return results;
  }

  // Check for mcp.json in .cursor directory
  const mcpConfigPath = join(cursorDir, 'mcp.json');
  const config = readJsonFile(mcpConfigPath) as MCPConfig | null;

  if (config?.mcpServers) {
    for (const [name, serverConfig] of Object.entries(config.mcpServers)) {
      results.push({
        name: `MCP: ${name}`,
        confidence: 90,
        evidence: [`Configured in .cursor/mcp.json`],
        variant: serverConfig.command || serverConfig.url || 'configured',
      });
    }
  }

  return results;
}

/**
 * Detect MCP configuration from root mcp.json
 */
function detectRootMCP(projectRoot: string): DetectionResult[] {
  const results: DetectionResult[] = [];
  const mcpConfigPath = join(projectRoot, 'mcp.json');
  const config = readJsonFile(mcpConfigPath) as MCPConfig | null;

  if (config?.mcpServers) {
    for (const [name, serverConfig] of Object.entries(config.mcpServers)) {
      results.push({
        name: `MCP: ${name}`,
        confidence: 90,
        evidence: [`Configured in mcp.json`],
        variant: serverConfig.command || serverConfig.url || 'configured',
      });
    }
  }

  return results;
}

/**
 * Infer recommended MCP servers from dependencies
 */
function inferMCPFromDeps(deps: Record<string, string>): string[] {
  const recommendations: string[] = [];

  // Supabase → Supabase MCP
  if (deps['@supabase/supabase-js'] || deps['@supabase/ssr']) {
    recommendations.push('supabase');
  }

  // GitHub (if repo uses git) → GitHub MCP
  // This is almost always useful
  recommendations.push('github');

  // Stripe → Stripe MCP (if available)
  if (deps.stripe) {
    recommendations.push('stripe');
  }

  // PostgreSQL → Postgres MCP
  if (deps.pg || deps.postgres || deps['@prisma/client']) {
    recommendations.push('postgres');
  }

  // Filesystem is almost always useful
  recommendations.push('filesystem');

  // Memory/knowledge base
  recommendations.push('memory');

  return [...new Set(recommendations)]; // Remove duplicates
}

/**
 * MCP servers detector
 * Returns detected MCP configurations and recommendations
 */
export const mcpServersDetector: Detector = {
  category: 'mcp',
  name: 'MCP Servers Detector',

  async detect(projectRoot: string): Promise<DetectionResult[] | null> {
    const results: DetectionResult[] = [];

    // Detect configured MCP servers
    results.push(...detectClaudeMCP(projectRoot));
    results.push(...detectCursorMCP(projectRoot));
    results.push(...detectRootMCP(projectRoot));

    // Deduplicate by name
    const seen = new Set<string>();
    const uniqueResults = results.filter(r => {
      if (seen.has(r.name)) return false;
      seen.add(r.name);
      return true;
    });

    // If we found configured servers, return them
    if (uniqueResults.length > 0) {
      return uniqueResults;
    }

    // Otherwise, check for MCP config directories existence
    const claudeDir = join(projectRoot, '.claude');
    const cursorDir = join(projectRoot, '.cursor');

    if (existsSync(claudeDir) || existsSync(cursorDir)) {
      return [{
        name: 'MCP Config Directory',
        confidence: 50,
        evidence: [
          existsSync(claudeDir) ? '.claude/ directory found' : '',
          existsSync(cursorDir) ? '.cursor/ directory found' : '',
        ].filter(Boolean),
      }];
    }

    return null;
  },
};

/**
 * Get recommended MCP servers based on project stack
 * This is a utility function, not a detector
 */
export function getRecommendedMCPServers(projectRoot: string): string[] {
  const pkg = readPackageJson(projectRoot);
  if (!pkg) {
    return ['filesystem', 'github', 'memory'];
  }

  const deps = getDependencies(pkg);
  return inferMCPFromDeps(deps);
}

export default mcpServersDetector;
