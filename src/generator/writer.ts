/**
 * File Writer
 * Creates .ralph directory structure and writes processed templates
 */

import { mkdir, writeFile, readFile, copyFile, stat, rename, readdir } from 'node:fs/promises';
import { join, dirname, basename } from 'node:path';
import { existsSync } from 'node:fs';

/**
 * Options for file writing
 */
export interface WriteOptions {
  /** How to handle existing files: 'backup', 'skip', 'overwrite' */
  existingFiles: 'backup' | 'skip' | 'overwrite';
  /** Whether to create backup files */
  createBackups: boolean;
  /** Verbose output */
  verbose: boolean;
}

/**
 * Default write options
 */
export const DEFAULT_WRITE_OPTIONS: WriteOptions = {
  existingFiles: 'backup',
  createBackups: true,
  verbose: false,
};

/**
 * Result of a write operation
 */
export interface WriteResult {
  /** Path that was written */
  path: string;
  /** Whether the write was successful */
  success: boolean;
  /** Action taken: created, backed_up, skipped, overwritten */
  action: 'created' | 'backed_up' | 'skipped' | 'overwritten' | 'error';
  /** Error message if any */
  error?: string;
  /** Backup path if created */
  backupPath?: string;
}

/**
 * Summary of all write operations
 */
export interface WriteSummary {
  /** Total files processed */
  total: number;
  /** Files created (new) */
  created: number;
  /** Files backed up and replaced */
  backedUp: number;
  /** Files skipped (already existed) */
  skipped: number;
  /** Files overwritten */
  overwritten: number;
  /** Files that failed */
  errors: number;
  /** Individual results */
  results: WriteResult[];
}

/**
 * Create a directory and all parent directories
 */
export async function ensureDir(dirPath: string): Promise<void> {
  await mkdir(dirPath, { recursive: true });
}

/**
 * Check if a file exists
 */
export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Create a backup of an existing file
 */
export async function backupFile(filePath: string): Promise<string> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const dir = dirname(filePath);
  const name = basename(filePath);
  const backupPath = join(dir, `.${name}.backup-${timestamp}`);

  await copyFile(filePath, backupPath);
  return backupPath;
}

/**
 * Write a single file with options
 */
export async function writeFileWithOptions(
  filePath: string,
  content: string,
  options: WriteOptions = DEFAULT_WRITE_OPTIONS
): Promise<WriteResult> {
  const result: WriteResult = {
    path: filePath,
    success: false,
    action: 'created',
  };

  try {
    // Ensure directory exists
    await ensureDir(dirname(filePath));

    // Check if file exists
    const exists = await fileExists(filePath);

    if (exists) {
      switch (options.existingFiles) {
        case 'skip':
          result.action = 'skipped';
          result.success = true;
          return result;

        case 'backup':
          if (options.createBackups) {
            result.backupPath = await backupFile(filePath);
            result.action = 'backed_up';
          } else {
            result.action = 'overwritten';
          }
          break;

        case 'overwrite':
          result.action = 'overwritten';
          break;
      }
    }

    // Write the file
    await writeFile(filePath, content, 'utf-8');
    result.success = true;

    if (options.verbose) {
      console.log(`  ${result.action}: ${filePath}`);
    }
  } catch (error) {
    result.action = 'error';
    result.error = error instanceof Error ? error.message : String(error);
    result.success = false;
  }

  return result;
}

/**
 * Write multiple files from a Map
 */
export async function writeFiles(
  files: Map<string, string>,
  baseDir: string,
  options: WriteOptions = DEFAULT_WRITE_OPTIONS
): Promise<WriteSummary> {
  const summary: WriteSummary = {
    total: files.size,
    created: 0,
    backedUp: 0,
    skipped: 0,
    overwritten: 0,
    errors: 0,
    results: [],
  };

  for (const [relativePath, content] of files) {
    const fullPath = join(baseDir, relativePath);
    if (relativePath === '.gitignore') {
      const existing = existsSync(fullPath)
        ? await readFile(fullPath, 'utf-8')
        : '';
      const existingLines = existing.split(/\r?\n/);
      const existingSet = new Set(existingLines.map((line) => line.trim()));
      const additions = content.split(/\r?\n/).filter((line) => line.trim().length > 0);
      const missing = additions.filter((line) => !existingSet.has(line.trim()));

      if (missing.length === 0 && existing) {
        summary.skipped += 1;
        summary.results.push({
          path: fullPath,
          success: true,
          action: 'skipped',
        });
        continue;
      }

      const mergedLines = existingLines.slice();
      if (mergedLines.length > 0 && mergedLines[mergedLines.length - 1].trim() !== '') {
        mergedLines.push('');
      }
      mergedLines.push(...missing);

      await ensureDir(dirname(fullPath));
      await writeFile(fullPath, mergedLines.join('\n'), 'utf-8');

      summary.results.push({
        path: fullPath,
        success: true,
        action: existing ? 'overwritten' : 'created',
      });
      if (existing) {
        summary.overwritten += 1;
      } else {
        summary.created += 1;
      }
      continue;
    }

    const result = await writeFileWithOptions(fullPath, content, options);
    summary.results.push(result);

    switch (result.action) {
      case 'created':
        summary.created++;
        break;
      case 'backed_up':
        summary.backedUp++;
        break;
      case 'skipped':
        summary.skipped++;
        break;
      case 'overwritten':
        summary.overwritten++;
        break;
      case 'error':
        summary.errors++;
        break;
    }
  }

  return summary;
}

/**
 * Directory structure for .ralph
 */
export const RALPH_DIRECTORY_STRUCTURE = {
  root: '.ralph',
  directories: [
    '.ralph/prompts',
    '.ralph/guides',
    '.ralph/specs',
    '.ralph/scripts',
  ],
};

/**
 * Create the .ralph directory structure
 */
export async function createDirectoryStructure(projectRoot: string): Promise<void> {
  for (const dir of RALPH_DIRECTORY_STRUCTURE.directories) {
    await ensureDir(join(projectRoot, dir));
  }
}

/**
 * Map template output paths to their final locations in .ralph
 */
export function mapTemplateOutputPaths(templateOutputs: Map<string, string>): Map<string, string> {
  const mapped = new Map<string, string>();

  for (const [outputPath, content] of templateOutputs) {
    // Map template categories to .ralph structure
    let finalPath: string;

    if (outputPath.startsWith('prompts/')) {
      finalPath = `.ralph/${outputPath}`;
    } else if (outputPath.startsWith('guides/')) {
      finalPath = `.ralph/${outputPath}`;
    } else if (outputPath.startsWith('specs/')) {
      finalPath = `.ralph/${outputPath}`;
    } else if (outputPath.startsWith('scripts/')) {
      // Scripts go to .ralph/scripts/
      finalPath = `.ralph/${outputPath}`;
    } else if (outputPath.startsWith('config/')) {
      // ralph.config.cjs goes to project root
      finalPath = outputPath.replace('config/', '');
    } else if (outputPath.startsWith('root/')) {
      // Root files go to .ralph/
      finalPath = `.ralph/${outputPath.replace('root/', '')}`;
    } else {
      // Default: put in .ralph/
      finalPath = `.ralph/${outputPath}`;
    }

    mapped.set(finalPath, content);
  }

  return mapped;
}

/**
 * Format write summary for display
 */
export function formatWriteSummary(summary: WriteSummary): string {
  const lines: string[] = [];

  lines.push('Write Summary:');
  lines.push(`  Total files: ${summary.total}`);
  lines.push(`  Created: ${summary.created}`);

  if (summary.backedUp > 0) {
    lines.push(`  Backed up & updated: ${summary.backedUp}`);
  }

  if (summary.skipped > 0) {
    lines.push(`  Skipped (existing): ${summary.skipped}`);
  }

  if (summary.overwritten > 0) {
    lines.push(`  Overwritten: ${summary.overwritten}`);
  }

  if (summary.errors > 0) {
    lines.push(`  Errors: ${summary.errors}`);
    for (const result of summary.results) {
      if (result.action === 'error') {
        lines.push(`    - ${result.path}: ${result.error}`);
      }
    }
  }

  return lines.join('\n');
}
