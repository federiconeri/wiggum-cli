/**
 * polishGoal — Pure utility functions for generating a polished, imperative
 * single-sentence Goal line in the spec completion summary.
 *
 * No AI calls, no side-effects. Deterministic string transformations only.
 */

/** Allowed imperative verbs that may begin a polished goal sentence. */
const IMPERATIVE_VERBS = [
  'Implement',
  'Add',
  'Improve',
  'Fix',
  'Refactor',
  'Support',
  'Enable',
  'Create',
  'Update',
  'Build',
  'Extend',
  'Migrate',
  'Remove',
  'Replace',
  'Integrate',
  'Define',
];

const IMPERATIVE_VERB_PATTERN = new RegExp(
  `^(${IMPERATIVE_VERBS.join('|')})\\b`,
  'i'
);

/** Leading framing-phrase patterns to strip/rewrite, each returning a cleaned fragment. */
const FRAMING_PATTERNS: Array<[RegExp, string]> = [
  [/^i want to\s*/i, ''],
  [/^i'd like to\s*/i, ''],
  [/^i would like to\s*/i, ''],
  [/^we will\s*/i, ''],
  [/^we want to\s*/i, ''],
  [/^this spec covers\s*/i, ''],
  [/^this spec describes\s*/i, ''],
  [/^the goal is to\s*/i, ''],
  [/^we need to\s*/i, ''],
  // Handles normalizeRecap output like "To build …" (stripped "you want" prefix)
  [/^to\s+/i, ''],
];

/** Strip bullet prefixes (`-`, `*`, `1.`, `•`) from a single line. */
function stripBulletPrefix(line: string): string {
  return line.replace(/^(\s*[-*•]|\s*\d+[.)]\s*)\s*/, '').trim();
}

/** Collapse multi-space/newline whitespace to a single space and trim. */
function normalizeWhitespace(text: string): string {
  return text.replace(/[\r\n\t]+/g, ' ').replace(/\s{2,}/g, ' ').trim();
}

/** Return true if this part looks like an abbreviation fragment (e.g. "e.g", "i.e", "vs"). */
function looksLikeAbbreviation(fragment: string): boolean {
  return /^(e\.g|i\.e|etc|vs|mr|mrs|dr|prof|no|vol|fig|ch|approx|est)$/i.test(
    fragment.trim()
  );
}

/**
 * Enforce single-sentence: split conservatively on `. ` boundaries, skipping
 * abbreviation-like fragments, then return only the first sentence.
 */
function toOneSentence(text: string): string {
  // Split on ". " followed by an uppercase letter — conservative heuristic
  const parts = text.split(/(?<=\b\w{3,})\. (?=[A-Z])/);
  if (parts.length <= 1) return text;
  // Take first part only
  const first = parts[0]!;
  // Guard against abbreviations causing false splits
  if (looksLikeAbbreviation(first)) return text;
  return first;
}

/**
 * selectGoalSource — Choose the best source for the goal line from a
 * structured set of candidates, applying the spec's 3-tier fallback chain:
 *   1. AI recap (if non-empty/non-whitespace)
 *   2. Key decisions (if non-empty/non-whitespace after normalisation)
 *   3. User request (fallback)
 *
 * For `keyDecisions`, bullet prefixes are stripped and fragments joined with `; `.
 */
export function selectGoalSource(opts: {
  aiRecap: string;
  keyDecisions: string | string[];
  userRequest: string;
}): { source: 'ai' | 'decisions' | 'user'; text: string } {
  const { aiRecap, keyDecisions, userRequest } = opts;

  // 1. AI recap
  const normalizedAi = normalizeWhitespace(aiRecap);
  if (normalizedAi.length > 0) {
    return { source: 'ai', text: normalizedAi };
  }

  // 2. Key decisions
  const decisionsArr = Array.isArray(keyDecisions)
    ? keyDecisions
    : keyDecisions
    ? [keyDecisions]
    : [];

  const cleanedDecisions = decisionsArr
    .map((d) => stripBulletPrefix(normalizeWhitespace(d)))
    .filter((d) => d.length > 0);

  if (cleanedDecisions.length > 0) {
    const joined = cleanedDecisions.join('; ');
    return { source: 'decisions', text: joined };
  }

  // 3. User request
  return { source: 'user', text: normalizeWhitespace(userRequest) };
}

/**
 * polishGoalSentence — Transform any goal source text into a polished,
 * imperative, single-sentence string ending with a period.
 *
 * Steps applied (all deterministic):
 *  1. Whitespace normalization
 *  2. Strip trailing ellipses
 *  3. Remove leading framing phrases ("I want to …", "We will …", etc.)
 *  4. Single-sentence enforcement (take first sentence)
 *  5. Imperative verb enforcement (prepend "Implement " if needed)
 *  6. Capitalise first letter
 *  7. Ensure exactly one trailing period
 */
export function polishGoalSentence(text: string): string {
  if (!text || text.trim().length === 0) {
    return 'Implement the requested feature.';
  }

  // 1. Whitespace normalization
  let result = normalizeWhitespace(text);

  // 2. Strip trailing ellipses
  result = result.replace(/\.{2,}$/, '').replace(/…$/, '').trim();

  // 3. Remove leading framing phrases iteratively (apply first matching pattern)
  for (const [pattern, replacement] of FRAMING_PATTERNS) {
    if (pattern.test(result)) {
      result = result.replace(pattern, replacement).trim();
      break;
    }
  }

  // 4. Single-sentence enforcement
  result = toOneSentence(result);

  // Strip any trailing sentence-ending punctuation before we add our own
  result = result.replace(/[.!?]+$/, '').trim();

  // 5. Imperative verb enforcement
  if (!IMPERATIVE_VERB_PATTERN.test(result)) {
    // Lowercase first char before prepending to avoid "Implement The thing"
    result = result.charAt(0).toLowerCase() + result.slice(1);
    result = `Implement ${result}`;
  }

  // 6. Capitalize first letter
  result = result.charAt(0).toUpperCase() + result.slice(1);

  // 7. Ensure exactly one trailing period
  result = `${result}.`;

  return result;
}
