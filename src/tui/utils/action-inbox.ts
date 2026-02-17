/**
 * Action inbox helpers for file-based IPC between loop processes and the TUI.
 *
 * The loop writes an action request file; the TUI reads it and writes a reply.
 * Both files live in /tmp with the conventional ralph-loop-<feature> prefix.
 */

import { rename, unlink, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { logger } from '../../utils/logger.js';

export interface ActionChoice {
  id: string;
  label: string;
}

export interface ActionRequest {
  id: string;
  prompt: string;
  choices: ActionChoice[];
  default: string;
}

export interface ActionReply {
  id: string;
  choice: string;
}

const FEATURE_REGEX = /^[a-zA-Z0-9_-]+$/;

function validateFeature(feature: string): void {
  if (!FEATURE_REGEX.test(feature)) {
    throw new Error(
      `Invalid feature name: "${feature}". Must contain only letters, numbers, hyphens, and underscores.`
    );
  }
}

/**
 * Return the path to the action request file for a feature.
 */
export function getActionRequestPath(feature: string): string {
  validateFeature(feature);
  return `/tmp/ralph-loop-${feature}.action.json`;
}

/**
 * Return the path to the action reply file for a feature.
 */
export function getActionReplyPath(feature: string): string {
  validateFeature(feature);
  return `/tmp/ralph-loop-${feature}.action.reply.json`;
}

/**
 * Read and validate the action request file for a feature.
 *
 * Returns null if the file does not exist, cannot be parsed, or is missing
 * required fields. Logs a warning on parse errors.
 */
export function readActionRequest(feature: string): ActionRequest | null {
  validateFeature(feature);

  const path = getActionRequestPath(feature);

  if (!existsSync(path)) {
    return null;
  }

  let raw: string;
  try {
    raw = readFileSync(path, 'utf-8');
  } catch (err) {
    logger.warn(`Failed to read action request file: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    logger.warn(`Failed to parse action request JSON: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }

  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    typeof (parsed as Record<string, unknown>).id !== 'string' ||
    typeof (parsed as Record<string, unknown>).prompt !== 'string' ||
    !Array.isArray((parsed as Record<string, unknown>).choices) ||
    typeof (parsed as Record<string, unknown>).default !== 'string'
  ) {
    logger.warn('Action request file is missing required fields (id, prompt, choices, default)');
    return null;
  }

  const record = parsed as Record<string, unknown>;
  const choices = record.choices as unknown[];

  for (const choice of choices) {
    if (
      typeof choice !== 'object' ||
      choice === null ||
      typeof (choice as Record<string, unknown>).id !== 'string' ||
      typeof (choice as Record<string, unknown>).label !== 'string'
    ) {
      logger.warn('Action request choices contain invalid entries (each must have id and label)');
      return null;
    }
  }

  return {
    id: record.id as string,
    prompt: record.prompt as string,
    choices: choices as ActionChoice[],
    default: record.default as string,
  };
}

/**
 * Write an action reply file atomically (write to .tmp then rename).
 */
export async function writeActionReply(feature: string, reply: ActionReply): Promise<void> {
  validateFeature(feature);

  const replyPath = getActionReplyPath(feature);
  const tmpPath = `${replyPath}.tmp`;
  const json = JSON.stringify(reply);

  await writeFile(tmpPath, json, 'utf-8');
  await rename(tmpPath, replyPath);
}

/**
 * Remove both action request and reply files. Tolerant to missing files.
 */
export async function cleanupActionFiles(feature: string): Promise<void> {
  validateFeature(feature);

  const requestPath = getActionRequestPath(feature);
  const replyPath = getActionReplyPath(feature);

  await Promise.all([
    unlink(requestPath).catch(() => undefined),
    unlink(replyPath).catch(() => undefined),
  ]);
}
