/**
 * AI Tools Module
 * Defines tools the AI agent can use to explore the codebase
 */

import { tool, zodSchema } from 'ai';
import { z } from 'zod';
import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * Create tools for codebase exploration
 */
export function createExplorationTools(projectRoot: string) {
  return {
    /**
     * Search code using ripgrep patterns
     */
    searchCode: tool({
      description: `Search the codebase using ripgrep. Use this to find:
- Function/class definitions: pattern="^(def|function|class) NAME", fileType="py"
- Symbol usage: pattern="\\bSymbolName\\b" (word boundaries critical!)
- Imports: pattern="^import.*module", fileType="ts"
- File patterns: pattern="pattern", glob="*.tsx"

Tips:
- Use fileType for filtering (py, js, ts, rust, go)
- Use \\b for word boundaries to avoid partial matches
- Use literal=true for exact strings (faster)
- Always use word boundaries when searching symbols`,
      inputSchema: zodSchema(z.object({
        pattern: z.string().describe('The regex pattern to search for'),
        fileType: z.string().optional().describe('File type filter (py, js, ts, etc.)'),
        glob: z.string().optional().describe('Glob pattern like "*.tsx" or "src/**/*.ts"'),
        literal: z.boolean().optional().describe('Use literal search (faster for exact strings)'),
        context: z.number().optional().describe('Lines of context (default 0)'),
        maxResults: z.number().optional().describe('Max results to return (default 50)'),
      })),
      execute: async ({ pattern, fileType, glob, literal, context, maxResults }) => {
        try {
          const args: string[] = [];

          if (literal) args.push('-F');
          if (fileType) args.push('-t', fileType);
          if (glob) args.push('-g', glob);
          if (context) args.push('-C', String(context));

          args.push('--max-count', String(maxResults || 50));
          args.push('--no-heading');
          args.push('--line-number');
          args.push('--');
          args.push(pattern);
          args.push(projectRoot);

          // Use spawnSync instead of execSync for safety (no shell injection)
          const result = spawnSync('rg', args, {
            encoding: 'utf-8',
            maxBuffer: 1024 * 1024,
            timeout: 30000,
          });

          if (result.error) {
            return `Search error: ${result.error.message}`;
          }

          if (result.status === 1) {
            return 'No matches found';
          }

          if (result.status !== 0) {
            return `Search error: ${result.stderr || 'Unknown error'}`;
          }

          // Convert absolute paths to relative
          const lines = result.stdout.split('\n').map(line => {
            if (line.startsWith(projectRoot)) {
              return line.replace(projectRoot + '/', '');
            }
            return line;
          });

          return lines.slice(0, 100).join('\n');
        } catch (error: unknown) {
          const errMsg = error instanceof Error ? error.message : String(error);
          return `Search error: ${errMsg}`;
        }
      },
    }),

    /**
     * Read a file's contents
     */
    readFile: tool({
      description: 'Read the contents of a file. Use relative paths from project root.',
      inputSchema: zodSchema(z.object({
        path: z.string().describe('Relative path to the file from project root'),
        startLine: z.number().optional().describe('Start line (1-indexed)'),
        endLine: z.number().optional().describe('End line (inclusive)'),
      })),
      execute: async ({ path: filePath, startLine, endLine }) => {
        try {
          // Prevent path traversal
          const normalizedPath = filePath.replace(/\.\./g, '');
          const fullPath = join(projectRoot, normalizedPath);

          if (!fullPath.startsWith(projectRoot)) {
            return 'Invalid path: cannot access files outside project';
          }

          if (!existsSync(fullPath)) {
            return `File not found: ${filePath}`;
          }

          const stat = statSync(fullPath);
          if (stat.isDirectory()) {
            return `Path is a directory, not a file: ${filePath}`;
          }

          if (stat.size > 100000) {
            return `File too large (${stat.size} bytes). Use startLine/endLine to read a portion.`;
          }

          const content = readFileSync(fullPath, 'utf-8');
          const lines = content.split('\n');

          if (startLine || endLine) {
            const start = (startLine || 1) - 1;
            const end = endLine || lines.length;
            return lines.slice(start, end).join('\n');
          }

          return content;
        } catch (error) {
          const errMsg = error instanceof Error ? error.message : String(error);
          return `Error reading file: ${errMsg}`;
        }
      },
    }),

    /**
     * List directory contents
     */
    listDirectory: tool({
      description: 'List contents of a directory. Shows files and subdirectories.',
      inputSchema: zodSchema(z.object({
        path: z.string().describe('Relative path to the directory (use "." for project root)'),
        recursive: z.boolean().optional().describe('List recursively (default false)'),
        maxDepth: z.number().optional().describe('Max depth for recursive listing (default 2)'),
      })),
      execute: async ({ path: dirPath, recursive, maxDepth }) => {
        try {
          // Prevent path traversal
          const normalizedPath = dirPath.replace(/\.\./g, '');
          const fullPath = join(projectRoot, normalizedPath);

          if (!fullPath.startsWith(projectRoot)) {
            return 'Invalid path: cannot access directories outside project';
          }

          if (!existsSync(fullPath)) {
            return `Directory not found: ${dirPath}`;
          }

          const stat = statSync(fullPath);
          if (!stat.isDirectory()) {
            return `Path is not a directory: ${dirPath}`;
          }

          const results: string[] = [];
          const depth = maxDepth || 2;

          function scanDir(dir: string, currentDepth: number): void {
            if (currentDepth > depth) return;

            const entries = readdirSync(dir, { withFileTypes: true });

            for (const entry of entries) {
              // Skip common ignored directories
              if (['node_modules', '.git', 'dist', 'build', '.next', '__pycache__'].includes(entry.name)) {
                continue;
              }

              const relativePath = relative(projectRoot, join(dir, entry.name));
              const prefix = entry.isDirectory() ? '📁 ' : '📄 ';
              results.push(prefix + relativePath);

              if (recursive && entry.isDirectory() && currentDepth < depth) {
                scanDir(join(dir, entry.name), currentDepth + 1);
              }
            }
          }

          scanDir(fullPath, 1);
          return results.slice(0, 200).join('\n');
        } catch (error) {
          const errMsg = error instanceof Error ? error.message : String(error);
          return `Error listing directory: ${errMsg}`;
        }
      },
    }),

    /**
     * Get package.json info including scripts
     */
    getPackageInfo: tool({
      description: 'Get package.json contents including scripts, dependencies, and metadata.',
      inputSchema: zodSchema(z.object({
        field: z.string().optional().describe('Specific field to get (scripts, dependencies, etc.)'),
      })),
      execute: async ({ field }) => {
        try {
          const pkgPath = join(projectRoot, 'package.json');

          if (!existsSync(pkgPath)) {
            return 'No package.json found';
          }

          const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));

          if (field) {
            return JSON.stringify(pkg[field], null, 2) || `Field "${field}" not found`;
          }

          // Return relevant parts
          return JSON.stringify({
            name: pkg.name,
            scripts: pkg.scripts,
            dependencies: Object.keys(pkg.dependencies || {}),
            devDependencies: Object.keys(pkg.devDependencies || {}),
          }, null, 2);
        } catch (error) {
          const errMsg = error instanceof Error ? error.message : String(error);
          return `Error reading package.json: ${errMsg}`;
        }
      },
    }),
  };
}

/**
 * Ripgrep skill reference for the AI agent
 */
export const RIPGREP_SKILL = `
## ripgrep Code Search Skill

### Essential Patterns

**Find definitions:**
- Python functions: pattern="^def \\w+\\(", fileType="py"
- JS/TS functions: pattern="^(export )?(function|const) \\w+", fileType="ts"
- Classes: pattern="^class \\w+", fileType="py"

**Find symbol usage (CRITICAL: use word boundaries):**
- Exact word: pattern="\\bSymbolName\\b"
- Literal string: pattern="exact.string", literal=true

**Find imports:**
- ES imports: pattern="^import.*from", fileType="ts"
- CommonJS: pattern="require\\(", fileType="js"

**File type options:**
- py (Python)
- js (JavaScript)
- ts (TypeScript)
- rust (Rust)
- go (Go)

**Performance tips:**
1. Always use fileType when possible
2. Use literal=true for exact strings
3. Use \\b for word boundaries (prevents partial matches)
4. Keep maxResults reasonable

**Word boundaries are critical:**
- WITHOUT: pattern="log" matches "logger", "blogger", "catalog"
- WITH: pattern="\\blog\\b" matches only "log"
`;
