/**
 * Tests for the action request JSON embedded in feature-loop.sh.tmpl
 *
 * The shell template contains a JSON payload written by write_action_request().
 * These tests validate that the JSON structure matches the ActionRequest schema
 * expected by the TUI and action-inbox helpers.
 *
 * Note: Full bash integration tests are out of scope. This focuses on the
 * JSON schema validation by reading the template file directly.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMPLATE_PATH = join(__dirname, 'feature-loop.sh.tmpl');

/**
 * Extract the JSON block written by write_action_request() from the template.
 * The JSON lives between `cat > "$action_file" << 'EOF'` and `EOF`.
 */
function extractActionRequestJson(): unknown {
  const content = readFileSync(TEMPLATE_PATH, 'utf-8');

  // Match the heredoc block: cat > ... << 'EOF' ... EOF
  const match = content.match(/cat\s*>\s*"\$action_file"\s*<<\s*'EOF'\s*\n([\s\S]*?)\nEOF/);
  if (!match?.[1]) {
    throw new Error('Could not find action request JSON in feature-loop.sh.tmpl');
  }

  return JSON.parse(match[1]);
}

describe('feature-loop.sh.tmpl — action request JSON schema', () => {
  it('parses the embedded JSON without errors', () => {
    const parsed = extractActionRequestJson();
    expect(parsed).toBeDefined();
  });

  it('has a non-empty string id field', () => {
    const parsed = extractActionRequestJson() as Record<string, unknown>;
    expect(typeof parsed.id).toBe('string');
    expect((parsed.id as string).length).toBeGreaterThan(0);
  });

  it('has a non-empty string prompt field', () => {
    const parsed = extractActionRequestJson() as Record<string, unknown>;
    expect(typeof parsed.prompt).toBe('string');
    expect((parsed.prompt as string).length).toBeGreaterThan(0);
  });

  it('has a choices array with at least one entry', () => {
    const parsed = extractActionRequestJson() as Record<string, unknown>;
    expect(Array.isArray(parsed.choices)).toBe(true);
    expect((parsed.choices as unknown[]).length).toBeGreaterThan(0);
  });

  it('each choice has a non-empty string id and label', () => {
    const parsed = extractActionRequestJson() as Record<string, unknown>;
    const choices = parsed.choices as Array<Record<string, unknown>>;

    for (const choice of choices) {
      expect(typeof choice.id).toBe('string');
      expect((choice.id as string).length).toBeGreaterThan(0);
      expect(typeof choice.label).toBe('string');
      expect((choice.label as string).length).toBeGreaterThan(0);
    }
  });

  it('has a non-empty string default field', () => {
    const parsed = extractActionRequestJson() as Record<string, unknown>;
    expect(typeof parsed.default).toBe('string');
    expect((parsed.default as string).length).toBeGreaterThan(0);
  });

  it('default value matches one of the choice ids', () => {
    const parsed = extractActionRequestJson() as Record<string, unknown>;
    const choices = parsed.choices as Array<Record<string, unknown>>;
    const choiceIds = choices.map((c) => c.id as string);
    expect(choiceIds).toContain(parsed.default as string);
  });

  it('all required ActionRequest fields are present', () => {
    const parsed = extractActionRequestJson() as Record<string, unknown>;
    expect(parsed).toHaveProperty('id');
    expect(parsed).toHaveProperty('prompt');
    expect(parsed).toHaveProperty('choices');
    expect(parsed).toHaveProperty('default');
  });
});
