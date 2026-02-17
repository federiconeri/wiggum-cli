/**
 * Tests for action-inbox.ts
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as fsPromises from 'node:fs/promises';

vi.mock('node:fs');
vi.mock('node:fs/promises');
vi.mock('../../utils/logger.js', () => ({
  logger: {
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

import {
  getActionRequestPath,
  getActionReplyPath,
  readActionRequest,
  writeActionReply,
  cleanupActionFiles,
} from './action-inbox.js';
import { logger } from '../../utils/logger.js';

const FEATURE = 'my-feature';
const REQUEST_PATH = `/tmp/ralph-loop-${FEATURE}.action.json`;
const REPLY_PATH = `/tmp/ralph-loop-${FEATURE}.action.reply.json`;

const VALID_REQUEST = {
  id: 'post_pr_choice',
  prompt: 'What would you like to do?',
  choices: [
    { id: 'merge_local', label: 'Merge back to main locally' },
    { id: 'keep_branch', label: 'Keep branch as-is' },
  ],
  default: 'keep_branch',
};

describe('getActionRequestPath', () => {
  it('returns the correct path for a valid feature', () => {
    expect(getActionRequestPath(FEATURE)).toBe(REQUEST_PATH);
  });

  it('throws for invalid feature names', () => {
    expect(() => getActionRequestPath('bad/feature')).toThrow(/Invalid feature name/);
    expect(() => getActionRequestPath('has space')).toThrow(/Invalid feature name/);
    expect(() => getActionRequestPath('')).toThrow(/Invalid feature name/);
  });
});

describe('getActionReplyPath', () => {
  it('returns the correct path for a valid feature', () => {
    expect(getActionReplyPath(FEATURE)).toBe(REPLY_PATH);
  });

  it('throws for invalid feature names', () => {
    expect(() => getActionReplyPath('bad.feature')).toThrow(/Invalid feature name/);
  });
});

describe('readActionRequest', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns null when the file does not exist', () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);

    const result = readActionRequest(FEATURE);

    expect(result).toBeNull();
    expect(fs.readFileSync).not.toHaveBeenCalled();
  });

  it('parses a valid action request correctly', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(VALID_REQUEST));

    const result = readActionRequest(FEATURE);

    expect(result).toEqual(VALID_REQUEST);
  });

  it('returns null and logs a warning on invalid JSON', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue('not valid json {{{');

    const result = readActionRequest(FEATURE);

    expect(result).toBeNull();
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('Failed to parse action request JSON'));
  });

  it('returns null when required fields are missing (no id)', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    const { id: _id, ...withoutId } = VALID_REQUEST;
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(withoutId));

    const result = readActionRequest(FEATURE);

    expect(result).toBeNull();
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('missing required fields'));
  });

  it('returns null when required fields are missing (no prompt)', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    const { prompt: _prompt, ...withoutPrompt } = VALID_REQUEST;
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(withoutPrompt));

    const result = readActionRequest(FEATURE);

    expect(result).toBeNull();
  });

  it('returns null when required fields are missing (no choices)', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    const { choices: _choices, ...withoutChoices } = VALID_REQUEST;
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(withoutChoices));

    const result = readActionRequest(FEATURE);

    expect(result).toBeNull();
  });

  it('returns null when required fields are missing (no default)', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    const { default: _default, ...withoutDefault } = VALID_REQUEST;
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(withoutDefault));

    const result = readActionRequest(FEATURE);

    expect(result).toBeNull();
  });

  it('returns null when a choice is missing its label', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    const withBadChoice = {
      ...VALID_REQUEST,
      choices: [{ id: 'ok' }], // missing label
    };
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(withBadChoice));

    const result = readActionRequest(FEATURE);

    expect(result).toBeNull();
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('invalid entries'));
  });

  it('throws for invalid feature names', () => {
    expect(() => readActionRequest('bad/feature')).toThrow(/Invalid feature name/);
  });

  it('returns null and logs a warning when file cannot be read', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockImplementation(() => {
      throw new Error('permission denied');
    });

    const result = readActionRequest(FEATURE);

    expect(result).toBeNull();
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('Failed to read action request file'));
  });
});

describe('writeActionReply', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fsPromises.writeFile).mockResolvedValue(undefined);
    vi.mocked(fsPromises.rename).mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('writes to a .tmp file and then renames to the final path', async () => {
    const reply = { id: 'post_pr_choice', choice: 'keep_branch' };

    await writeActionReply(FEATURE, reply);

    expect(fsPromises.writeFile).toHaveBeenCalledWith(
      `${REPLY_PATH}.tmp`,
      JSON.stringify(reply),
      'utf-8'
    );
    expect(fsPromises.rename).toHaveBeenCalledWith(`${REPLY_PATH}.tmp`, REPLY_PATH);
  });

  it('writes valid JSON with correct structure', async () => {
    const reply = { id: 'post_pr_choice', choice: 'merge_local' };

    await writeActionReply(FEATURE, reply);

    const writtenContent = vi.mocked(fsPromises.writeFile).mock.calls[0][1] as string;
    const parsed = JSON.parse(writtenContent);
    expect(parsed).toEqual({ id: 'post_pr_choice', choice: 'merge_local' });
  });

  it('throws for invalid feature names', async () => {
    await expect(writeActionReply('bad feature', { id: 'x', choice: 'y' })).rejects.toThrow(
      /Invalid feature name/
    );
  });
});

describe('cleanupActionFiles', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('removes both action request and reply files', async () => {
    vi.mocked(fsPromises.unlink).mockResolvedValue(undefined);

    await cleanupActionFiles(FEATURE);

    expect(fsPromises.unlink).toHaveBeenCalledWith(REQUEST_PATH);
    expect(fsPromises.unlink).toHaveBeenCalledWith(REPLY_PATH);
  });

  it('succeeds when action request file does not exist', async () => {
    vi.mocked(fsPromises.unlink).mockImplementation(async (path) => {
      if (String(path) === REQUEST_PATH) throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    });

    await expect(cleanupActionFiles(FEATURE)).resolves.toBeUndefined();
  });

  it('succeeds when reply file does not exist', async () => {
    vi.mocked(fsPromises.unlink).mockImplementation(async (path) => {
      if (String(path) === REPLY_PATH) throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    });

    await expect(cleanupActionFiles(FEATURE)).resolves.toBeUndefined();
  });

  it('succeeds when neither file exists', async () => {
    vi.mocked(fsPromises.unlink).mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));

    await expect(cleanupActionFiles(FEATURE)).resolves.toBeUndefined();
  });

  it('throws for invalid feature names', async () => {
    await expect(cleanupActionFiles('bad/name')).rejects.toThrow(/Invalid feature name/);
  });
});
