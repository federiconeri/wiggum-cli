/**
 * Interview Tools
 * Codebase tools for the AI interview agent
 */

import { tool, zodSchema } from 'ai';
import { z } from 'zod';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

/** Maximum content length before truncation */
const MAX_CONTENT_LENGTH = 8000;

/** Maximum search results */
const MAX_SEARCH_RESULTS = 20;

/**
 * Validate path is within project root (security)
 */
function validatePath(projectRoot: string, targetPath: string): string | null {
  const absolutePath = resolve(projectRoot, targetPath);
  const normalizedProjectRoot = resolve(projectRoot);

  if (!absolutePath.startsWith(normalizedProjectRoot)) {
    return null; // Path traversal attempt
  }

  return absolutePath;
}

/**
 * Check if ripgrep is available
 */
function hasRipgrep(): boolean {
  const result = spawnSync('which', ['rg'], { encoding: 'utf-8' });
  return result.status === 0;
}

/**
 * Create codebase tools for interview agent
 */
export function createInterviewTools(projectRoot: string) {
  return {
    /**
     * Read a file from the project codebase
     */
    read_file: tool({
      description: `Read a file from the project codebase.
Use this to understand code structure, check implementations, or find patterns.
Returns file content (truncated if too long).`,
      inputSchema: zodSchema(z.object({
        path: z.string().describe('Relative path from project root (e.g., "src/index.ts")'),
      })),
      execute: async ({ path: filePath }: { path: string }) => {
        const fullPath = validatePath(projectRoot, filePath);

        if (!fullPath) {
          return { error: 'Invalid path: must be within project directory' };
        }

        if (!existsSync(fullPath)) {
          return { error: `File not found: ${filePath}` };
        }

        try {
          const stat = statSync(fullPath);
          if (stat.isDirectory()) {
            return { error: `Path is a directory, not a file: ${filePath}` };
          }

          const content = readFileSync(fullPath, 'utf-8');

          if (content.length > MAX_CONTENT_LENGTH) {
            return {
              content: content.slice(0, MAX_CONTENT_LENGTH),
              truncated: true,
              totalLength: content.length,
              message: `File truncated to ${MAX_CONTENT_LENGTH} characters (total: ${content.length})`,
            };
          }

          return { content, truncated: false };
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error);
          return { error: `Failed to read file: ${msg}` };
        }
      },
    }),

    /**
     * Search for patterns in the codebase
     */
    search_codebase: tool({
      description: `Search for patterns in the codebase using grep.
Use this to find function definitions, imports, usage patterns, or specific code.
Returns matching files with line snippets.`,
      inputSchema: zodSchema(z.object({
        pattern: z.string().describe('Search pattern (text or regex)'),
        directory: z.string().optional()
          .describe('Directory to search in (relative to project root). Defaults to entire project'),
        filePattern: z.string().optional()
          .describe('File pattern to match (e.g., "*.ts", "*.tsx")'),
        literal: z.boolean().optional()
          .describe('Use literal search instead of regex (faster for exact strings)'),
      })),
      execute: async ({ pattern, directory, filePattern, literal }: {
        pattern: string;
        directory?: string;
        filePattern?: string;
        literal?: boolean;
      }) => {
        // Determine search directory
        let searchPath = projectRoot;
        if (directory) {
          const validatedDir = validatePath(projectRoot, directory);
          if (!validatedDir) {
            return { error: 'Invalid search directory: must be within project' };
          }
          if (!existsSync(validatedDir)) {
            return { error: `Directory not found: ${directory}` };
          }
          searchPath = validatedDir;
        }

        try {
          let result;

          if (hasRipgrep()) {
            // Use ripgrep (faster)
            const args: string[] = [
              '--line-number',
              '--max-count', '3',
              '--max-filesize', '1M',
              '--no-heading',
              '--glob', '!node_modules',
              '--glob', '!.git',
              '--glob', '!dist',
              '--glob', '!build',
              '--glob', '!*.lock',
            ];

            if (literal) args.push('-F');
            if (filePattern) args.push('--glob', filePattern);

            args.push('--', pattern, searchPath);

            result = spawnSync('rg', args, {
              encoding: 'utf-8',
              maxBuffer: 1024 * 1024,
              timeout: 30000,
            });
          } else {
            // Fallback to grep
            const args: string[] = [
              '-rn',
              '--exclude-dir=node_modules',
              '--exclude-dir=.git',
              '--exclude-dir=dist',
              '--exclude-dir=build',
            ];

            if (literal) args.push('-F');
            if (filePattern) args.push(`--include=${filePattern}`);

            args.push(pattern, searchPath);

            result = spawnSync('grep', args, {
              encoding: 'utf-8',
              maxBuffer: 1024 * 1024,
              timeout: 30000,
            });
          }

          if (result.error) {
            return { error: `Search failed: ${result.error.message}` };
          }

          // Status 1 means no matches (for both rg and grep)
          if (result.status === 1 || !result.stdout?.trim()) {
            return { matches: [], message: `No matches found for "${pattern}"` };
          }

          // Parse output into structured results
          const lines = result.stdout.trim().split('\n').slice(0, MAX_SEARCH_RESULTS);
          const matches = lines.map(line => {
            // Format: file:line:content
            const colonIndex = line.indexOf(':');
            if (colonIndex === -1) return { file: line, line: 0, content: '' };

            const file = relative(projectRoot, line.slice(0, colonIndex));
            const rest = line.slice(colonIndex + 1);

            const lineNumMatch = rest.match(/^(\d+):/);
            if (lineNumMatch) {
              const lineNum = parseInt(lineNumMatch[1], 10);
              const content = rest.slice(lineNumMatch[0].length).trim();
              return { file, line: lineNum, content: content.slice(0, 200) };
            }

            return { file, line: 0, content: rest.slice(0, 200) };
          });

          return {
            matches,
            truncated: lines.length >= MAX_SEARCH_RESULTS,
            message: matches.length > 0
              ? `Found ${matches.length} match(es)`
              : `No matches found for "${pattern}"`,
          };
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error);
          return { error: `Search failed: ${msg}` };
        }
      },
    }),

    /**
     * List files in a directory
     */
    list_directory: tool({
      description: `List files and directories in a path.
Use this to explore project structure and find files to read.
Returns names and types (file/directory).`,
      inputSchema: zodSchema(z.object({
        path: z.string().describe('Directory path relative to project root (e.g., "src" or "src/components")'),
      })),
      execute: async ({ path: dirPath }: { path: string }) => {
        const targetPath = dirPath || '.';
        const fullPath = validatePath(projectRoot, targetPath);

        if (!fullPath) {
          return { error: 'Invalid path: must be within project directory' };
        }

        if (!existsSync(fullPath)) {
          return { error: `Directory not found: ${targetPath}` };
        }

        try {
          const stat = statSync(fullPath);
          if (!stat.isDirectory()) {
            return { error: `Path is a file, not a directory: ${targetPath}` };
          }

          const entries = readdirSync(fullPath, { withFileTypes: true });

          // Filter out common non-essential entries
          const filteredEntries = entries.filter(e => {
            const name = e.name;
            // Skip hidden files except .env.example, skip node_modules etc
            if (name === 'node_modules' || name === '.git' || name === 'dist' || name === 'build') {
              return false;
            }
            return !name.startsWith('.') || name === '.env.example';
          });

          const items = filteredEntries.map(e => ({
            name: e.name,
            type: e.isDirectory() ? 'directory' : 'file',
          }));

          // Sort: directories first, then files
          items.sort((a, b) => {
            if (a.type === b.type) return a.name.localeCompare(b.name);
            return a.type === 'directory' ? -1 : 1;
          });

          return {
            path: targetPath,
            items,
            count: items.length,
          };
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error);
          return { error: `Failed to list directory: ${msg}` };
        }
      },
    }),
  };
}

/**
 * Export tool types for TypeScript
 */
export type InterviewTools = ReturnType<typeof createInterviewTools>;
