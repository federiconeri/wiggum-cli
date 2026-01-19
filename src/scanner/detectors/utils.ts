/**
 * Shared Utilities for Detectors
 * Common functions used across multiple detector files
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Package.json type definition
 */
export type PackageJson = Record<string, unknown>;

/**
 * Dependencies map type
 */
export type DependencyMap = Record<string, string>;

/**
 * Read and parse package.json from a directory
 *
 * @param projectRoot - The root directory of the project
 * @returns Parsed package.json object or null if not found/invalid
 *
 * @example
 * const pkg = readPackageJson('/path/to/project');
 * if (pkg) {
 *   console.log(pkg.name);
 * }
 */
export function readPackageJson(projectRoot: string): PackageJson | null {
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
 * Get all dependencies from package.json (deps + devDeps combined)
 *
 * @param pkg - Parsed package.json object
 * @returns Combined dependencies and devDependencies map
 *
 * @example
 * const pkg = readPackageJson(projectRoot);
 * const deps = getDependencies(pkg);
 * if (deps.react) {
 *   console.log(`React version: ${deps.react}`);
 * }
 */
export function getDependencies(pkg: PackageJson | null): DependencyMap {
  if (!pkg) return {};
  const deps = (pkg.dependencies as DependencyMap) || {};
  const devDeps = (pkg.devDependencies as DependencyMap) || {};
  return { ...deps, ...devDeps };
}

/**
 * Find a config file with various possible extensions
 *
 * @param projectRoot - The root directory of the project
 * @param baseName - The base name of the config file (e.g., 'next.config')
 * @param extensions - Array of extensions to try (e.g., ['.js', '.ts', '.mjs'])
 * @returns The full filename if found, or null
 *
 * @example
 * const configFile = findConfigFile(projectRoot, 'next.config', ['.js', '.mjs', '.ts']);
 * if (configFile) {
 *   console.log(`Found: ${configFile}`);
 * }
 */
export function findConfigFile(
  projectRoot: string,
  baseName: string,
  extensions: string[]
): string | null {
  for (const ext of extensions) {
    const filePath = join(projectRoot, `${baseName}${ext}`);
    if (existsSync(filePath)) {
      return `${baseName}${ext}`;
    }
  }
  return null;
}

/**
 * Check if a directory exists
 *
 * @param projectRoot - The root directory of the project
 * @param dirName - The directory name to check
 * @returns True if the directory exists
 *
 * @example
 * if (checkDirectoryExists(projectRoot, 'src')) {
 *   console.log('Source directory found');
 * }
 */
export function checkDirectoryExists(projectRoot: string, dirName: string): boolean {
  return existsSync(join(projectRoot, dirName));
}

/**
 * Check if a file exists
 *
 * @param projectRoot - The root directory of the project
 * @param fileName - The file name to check
 * @returns True if the file exists
 *
 * @example
 * if (checkFileExists(projectRoot, 'vercel.json')) {
 *   console.log('Vercel config found');
 * }
 */
export function checkFileExists(projectRoot: string, fileName: string): boolean {
  return existsSync(join(projectRoot, fileName));
}

/**
 * Find all dependencies matching a prefix pattern
 *
 * @param deps - Dependencies map
 * @param pattern - Prefix pattern to match (e.g., '@supabase/')
 * @returns Array of matching dependency names
 *
 * @example
 * const supabasePackages = findMatchingDeps(deps, '@supabase/');
 * // Returns: ['@supabase/supabase-js', '@supabase/ssr', ...]
 */
export function findMatchingDeps(deps: DependencyMap, pattern: string): string[] {
  return Object.keys(deps).filter(
    (name) => name.startsWith(pattern) || name === pattern
  );
}

/**
 * Check if any dependency matches a pattern and return its version
 *
 * @param deps - Dependencies map
 * @param pattern - Prefix pattern to match
 * @returns Version string if found, undefined otherwise
 *
 * @example
 * const version = hasDependencyPattern(deps, '@supabase/');
 * if (version) {
 *   console.log(`Found supabase package: ${version}`);
 * }
 */
export function hasDependencyPattern(
  deps: DependencyMap,
  pattern: string
): string | undefined {
  for (const [name, version] of Object.entries(deps)) {
    if (name.startsWith(pattern) || name === pattern) {
      return version;
    }
  }
  return undefined;
}

/**
 * Read file content safely
 *
 * @param filePath - Full path to the file
 * @returns File content as string, or null if read fails
 *
 * @example
 * const content = readFileSafe('/path/to/config.json');
 * if (content) {
 *   const config = JSON.parse(content);
 * }
 */
export function readFileSafe(filePath: string): string | null {
  try {
    if (!existsSync(filePath)) {
      return null;
    }
    return readFileSync(filePath, 'utf-8');
  } catch {
    return null;
  }
}

/**
 * Parse JSON file safely
 *
 * @param projectRoot - The root directory of the project
 * @param fileName - The JSON file name
 * @returns Parsed JSON object or null if invalid
 *
 * @example
 * const config = parseJsonFile(projectRoot, 'tsconfig.json');
 * if (config?.compilerOptions) {
 *   console.log('TypeScript config found');
 * }
 */
export function parseJsonFile(
  projectRoot: string,
  fileName: string
): Record<string, unknown> | null {
  try {
    const filePath = join(projectRoot, fileName);
    if (!existsSync(filePath)) {
      return null;
    }
    const content = readFileSync(filePath, 'utf-8');
    return JSON.parse(content);
  } catch {
    return null;
  }
}

/**
 * Common config file extensions
 */
export const CONFIG_EXTENSIONS = {
  /** JavaScript/TypeScript config extensions */
  JS_TS: ['.js', '.ts', '.mjs', '.cjs'],
  /** JSON/YAML config extensions */
  DATA: ['.json', '.yaml', '.yml', '.toml'],
  /** All common config extensions */
  ALL: ['.js', '.ts', '.mjs', '.cjs', '.json', '.yaml', '.yml', '.toml'],
};

/**
 * Get npm scripts from package.json
 *
 * @param pkg - Parsed package.json object
 * @returns Scripts object or empty object
 */
export function getScripts(pkg: PackageJson | null): Record<string, string> {
  if (!pkg) return {};
  return (pkg.scripts as Record<string, string>) || {};
}

/**
 * Check if a specific npm script exists
 *
 * @param pkg - Parsed package.json object
 * @param scriptName - Name of the script to check
 * @returns True if the script exists
 */
export function hasScript(pkg: PackageJson | null, scriptName: string): boolean {
  const scripts = getScripts(pkg);
  return scriptName in scripts;
}
