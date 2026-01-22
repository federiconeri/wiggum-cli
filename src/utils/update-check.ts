/**
 * Update Check Utility
 * Checks npm registry for newer versions and notifies user
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import pc from 'picocolors';

const PACKAGE_NAME = 'wiggum-cli';
const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours
const CACHE_FILE = path.join(os.homedir(), '.wiggum-update-check.json');

interface UpdateCheckCache {
  lastCheck: number;
  latestVersion: string | null;
}

interface UpdateInfo {
  currentVersion: string;
  latestVersion: string;
  updateAvailable: boolean;
}

/**
 * Get current package version
 */
function getCurrentVersion(): string {
  try {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    // Go up from utils/ to package root
    const packageJsonPath = path.join(__dirname, '..', '..', 'package.json');
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
    return packageJson.version;
  } catch {
    return '0.0.0';
  }
}

/**
 * Read cache file
 */
function readCache(): UpdateCheckCache | null {
  try {
    if (fs.existsSync(CACHE_FILE)) {
      return JSON.parse(fs.readFileSync(CACHE_FILE, 'utf-8'));
    }
  } catch {
    // Ignore cache read errors
  }
  return null;
}

/**
 * Write cache file
 */
function writeCache(cache: UpdateCheckCache): void {
  try {
    fs.writeFileSync(CACHE_FILE, JSON.stringify(cache), 'utf-8');
  } catch {
    // Ignore cache write errors
  }
}

/**
 * Fetch latest version from npm registry
 */
async function fetchLatestVersion(): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000); // 3s timeout

    const response = await fetch(
      `https://registry.npmjs.org/${PACKAGE_NAME}/latest`,
      { signal: controller.signal }
    );

    clearTimeout(timeout);

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    return data.version || null;
  } catch {
    // Network error or timeout - fail silently
    return null;
  }
}

/**
 * Compare semantic versions
 * Returns true if v2 is newer than v1
 */
function isNewer(v1: string, v2: string): boolean {
  const parts1 = v1.split('.').map(Number);
  const parts2 = v2.split('.').map(Number);

  for (let i = 0; i < 3; i++) {
    const p1 = parts1[i] || 0;
    const p2 = parts2[i] || 0;
    if (p2 > p1) return true;
    if (p2 < p1) return false;
  }
  return false;
}

/**
 * Check for updates (with caching)
 * Returns update info if check was performed, null if skipped/failed
 */
export async function checkForUpdates(): Promise<UpdateInfo | null> {
  const currentVersion = getCurrentVersion();
  const cache = readCache();
  const now = Date.now();

  // Use cached result if recent enough
  if (cache && (now - cache.lastCheck) < CHECK_INTERVAL_MS && cache.latestVersion) {
    return {
      currentVersion,
      latestVersion: cache.latestVersion,
      updateAvailable: isNewer(currentVersion, cache.latestVersion),
    };
  }

  // Fetch latest version
  const latestVersion = await fetchLatestVersion();

  if (latestVersion) {
    writeCache({ lastCheck: now, latestVersion });
    return {
      currentVersion,
      latestVersion,
      updateAvailable: isNewer(currentVersion, latestVersion),
    };
  }

  return null;
}

/**
 * Display update notification if available
 * Call this at startup - it's non-blocking and fails silently
 */
export async function notifyIfUpdateAvailable(): Promise<void> {
  try {
    const info = await checkForUpdates();

    if (info?.updateAvailable) {
      console.log('');
      console.log(
        pc.yellow('╭─────────────────────────────────────────────────────────╮')
      );
      console.log(
        pc.yellow('│') +
          pc.bold('  Update available: ') +
          pc.dim(info.currentVersion) +
          pc.bold(' → ') +
          pc.green(info.latestVersion) +
          '                    ' +
          pc.yellow('│')
      );
      console.log(
        pc.yellow('│') +
          '  Run ' +
          pc.cyan('npm i -g wiggum-cli') +
          ' to update                  ' +
          pc.yellow('│')
      );
      console.log(
        pc.yellow('╰─────────────────────────────────────────────────────────╯')
      );
      console.log('');
    }
  } catch {
    // Fail silently - don't interrupt user workflow
  }
}
