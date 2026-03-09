import { execFile } from 'node:child_process';
import { existsSync, realpathSync } from 'node:fs';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export interface PreflightResult {
  ok: boolean;
  defaultBranch?: string;
  stashed?: boolean;
  error?: string;
}

export async function runPreflightChecks(
  projectRoot: string,
  featureName: string,
  emitProgress?: (toolName: string, line: string) => void,
): Promise<PreflightResult> {
  const opts = { cwd: projectRoot };

  // 1. Detect default branch
  let defaultBranch: string | undefined;

  try {
    const { stdout } = await execFileAsync(
      'git', ['symbolic-ref', '--short', 'refs/remotes/origin/HEAD'], opts,
    );
    defaultBranch = stdout.trim().replace(/^origin\//, '');
  } catch {
    // symbolic-ref not set, try fallbacks
  }

  if (!defaultBranch) {
    try {
      await execFileAsync('git', ['rev-parse', '--verify', 'main'], opts);
      defaultBranch = 'main';
    } catch {
      try {
        await execFileAsync('git', ['rev-parse', '--verify', 'master'], opts);
        defaultBranch = 'master';
      } catch {
        // neither exists
      }
    }
  }

  if (!defaultBranch) {
    return { ok: false, error: 'Cannot determine default branch: no origin/HEAD, main, or master found' };
  }

  emitProgress?.('preflight', `Default branch: ${defaultBranch}`);

  // 2. Clean stale worktrees
  try {
    await execFileAsync('git', ['worktree', 'prune'], opts);
  } catch {
    // prune failure is non-fatal
  }

  const branchName = `feat/${featureName}`;

  try {
    const { stdout } = await execFileAsync('git', ['worktree', 'list', '--porcelain'], opts);
    const worktrees = parseWorktreeList(stdout);

    // Resolve projectRoot to compare with worktree paths
    let resolvedRoot: string;
    try {
      resolvedRoot = realpathSync(projectRoot);
    } catch {
      resolvedRoot = projectRoot;
    }

    for (const wt of worktrees) {
      if (wt.branch === branchName || wt.branch === `refs/heads/${branchName}`) {
        // Branch is checked out in the main worktree (projectRoot itself) —
        // the loop script handles this case (it detects CURRENT_BRANCH == BRANCH).
        let resolvedWtPath: string;
        try {
          resolvedWtPath = realpathSync(wt.path);
        } catch {
          resolvedWtPath = wt.path;
        }
        if (resolvedWtPath === resolvedRoot) {
          emitProgress?.('preflight', `Branch ${branchName} already checked out in project root`);
          continue;
        }

        // Branch is checked out in a different worktree
        const isEphemeral = wt.path.includes('/.claude/worktrees/');
        if (!existsSync(wt.path) || !existsSync(`${wt.path}/.git`) || isEphemeral) {
          // Stale or ephemeral worktree — auto-fix
          emitProgress?.('preflight', `Removing ${isEphemeral ? 'ephemeral' : 'stale'} worktree at ${wt.path}`);
          try {
            await execFileAsync('git', ['worktree', 'remove', '--force', wt.path], opts);
          } catch {
            // If remove fails, try prune again
            await execFileAsync('git', ['worktree', 'prune'], opts).catch(() => {});
          }
        } else {
          return { ok: false, error: `Branch locked by active worktree at ${wt.path}` };
        }
      }
    }
  } catch {
    // worktree list failure is non-fatal (may not be in a git repo with worktree support)
  }

  // 3. Stash dirty working tree so branch switching succeeds
  let stashed = false;
  let dirty = false;
  try {
    const { stdout } = await execFileAsync('git', ['status', '--porcelain'], opts);
    dirty = stdout.trim().length > 0;
  } catch {
    // status check failure — proceed optimistically
  }

  if (dirty) {
    emitProgress?.('preflight', 'Stashing uncommitted changes');
    try {
      await execFileAsync(
        'git', ['stash', 'push', '-m', `wiggum-preflight: auto-stash before ${branchName}`], opts,
      );
      stashed = true;
    } catch {
      return { ok: false, error: 'Working tree has uncommitted changes and git stash failed' };
    }
  }

  return { ok: true, defaultBranch, stashed };
}

interface WorktreeEntry {
  path: string;
  branch: string;
}

function parseWorktreeList(output: string): WorktreeEntry[] {
  const entries: WorktreeEntry[] = [];
  let currentPath = '';
  let currentBranch = '';

  for (const line of output.split('\n')) {
    if (line.startsWith('worktree ')) {
      currentPath = line.slice('worktree '.length);
    } else if (line.startsWith('branch ')) {
      currentBranch = line.slice('branch '.length);
    } else if (line === '') {
      if (currentPath && currentBranch) {
        entries.push({ path: currentPath, branch: currentBranch });
      }
      currentPath = '';
      currentBranch = '';
    }
  }
  // Handle last entry without trailing newline
  if (currentPath && currentBranch) {
    entries.push({ path: currentPath, branch: currentBranch });
  }

  return entries;
}
