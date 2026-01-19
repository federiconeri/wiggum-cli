/**
 * MCP Project Detector
 * Detects if the project is building an MCP server
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
 * Detect if project is an MCP server
 */
function detectMCPServer(projectRoot: string, pkg: Record<string, unknown>, deps: Record<string, string>): DetectionResult | null {
  const evidence: string[] = [];
  let confidence = 0;

  // Check for @modelcontextprotocol/sdk
  if (deps['@modelcontextprotocol/sdk']) {
    evidence.push(`@modelcontextprotocol/sdk@${deps['@modelcontextprotocol/sdk']} in dependencies`);
    confidence += 70;
  }

  // Check for mcp-* or *-mcp in package name
  const packageName = pkg.name as string | undefined;
  if (packageName) {
    if (packageName.startsWith('mcp-') || packageName.endsWith('-mcp')) {
      evidence.push(`Package name "${packageName}" follows MCP naming convention`);
      confidence += 20;
    }
    if (packageName.includes('mcp-server') || packageName.includes('server-mcp')) {
      evidence.push(`Package name "${packageName}" indicates MCP server`);
      confidence += 10;
    }
  }

  // Check for MCP-related keywords in package.json
  const keywords = pkg.keywords as string[] | undefined;
  if (keywords && Array.isArray(keywords)) {
    const mcpKeywords = keywords.filter(k =>
      k.toLowerCase().includes('mcp') ||
      k.toLowerCase().includes('model-context-protocol') ||
      k.toLowerCase().includes('claude')
    );
    if (mcpKeywords.length > 0) {
      evidence.push(`MCP-related keywords: ${mcpKeywords.join(', ')}`);
      confidence += 10;
    }
  }

  // Check for MCP server files
  const serverFiles = [
    'src/index.ts',
    'src/server.ts',
    'src/mcp.ts',
    'index.ts',
    'server.ts',
  ];

  for (const file of serverFiles) {
    const filePath = join(projectRoot, file);
    if (existsSync(filePath)) {
      try {
        const content = readFileSync(filePath, 'utf-8');
        if (content.includes('@modelcontextprotocol/sdk') || content.includes('McpServer')) {
          evidence.push(`MCP server code found in ${file}`);
          confidence += 20;
          break;
        }
      } catch {
        // Ignore read errors
      }
    }
  }

  // Check for package.json bin field (common for MCP servers)
  if (pkg.bin && deps['@modelcontextprotocol/sdk']) {
    evidence.push('Package has bin field (likely a CLI MCP server)');
    confidence += 10;
  }

  if (confidence === 0) return null;

  return {
    name: 'MCP Server Project',
    version: deps['@modelcontextprotocol/sdk'],
    confidence: Math.min(confidence, 100),
    evidence,
  };
}

/**
 * Detect if project uses MCP client
 */
function detectMCPClient(deps: Record<string, string>): DetectionResult | null {
  const evidence: string[] = [];
  let confidence = 0;

  // Check for MCP client packages
  if (deps['@anthropic-ai/sdk']) {
    evidence.push(`@anthropic-ai/sdk@${deps['@anthropic-ai/sdk']} in dependencies`);
    confidence += 50;
  }

  if (deps['@modelcontextprotocol/sdk']) {
    // Could be either client or server, lower confidence
    evidence.push('MCP SDK found (could be client usage)');
    confidence += 30;
  }

  if (confidence === 0) return null;

  return {
    name: 'MCP Client',
    confidence: Math.min(confidence, 100),
    evidence,
  };
}

/**
 * MCP project detector
 * Detects if the project is an MCP server or uses MCP
 */
export const mcpProjectDetector: Detector = {
  category: 'mcp',
  name: 'MCP Project Detector',

  async detect(projectRoot: string): Promise<DetectionResult | null> {
    const pkg = readPackageJson(projectRoot);
    if (!pkg) {
      return null;
    }

    const deps = getDependencies(pkg);

    // First check if it's an MCP server project
    const serverResult = detectMCPServer(projectRoot, pkg, deps);
    if (serverResult && serverResult.confidence >= 40) {
      return serverResult;
    }

    // Then check if it uses MCP client
    const clientResult = detectMCPClient(deps);
    if (clientResult && clientResult.confidence >= 40) {
      return clientResult;
    }

    return null;
  },
};

export default mcpProjectDetector;
