import { describe, it, expect } from 'vitest';
import { selectGoalSource, polishGoalSentence } from './polishGoal.js';

// ---------------------------------------------------------------------------
// selectGoalSource
// ---------------------------------------------------------------------------
describe('selectGoalSource', () => {
  it('chooses AI recap when present', () => {
    const result = selectGoalSource({
      aiRecap: 'You want to add user authentication.',
      keyDecisions: 'Use JWT tokens',
      userRequest: 'I want to add auth',
    });
    expect(result.source).toBe('ai');
    expect(result.text).toBe('You want to add user authentication.');
  });

  it('chooses decisions when AI recap is absent', () => {
    const result = selectGoalSource({
      aiRecap: '',
      keyDecisions: 'Use JWT tokens',
      userRequest: 'I want to add auth',
    });
    expect(result.source).toBe('decisions');
    expect(result.text).toBe('Use JWT tokens');
  });

  it('chooses decisions when AI recap is whitespace-only', () => {
    const result = selectGoalSource({
      aiRecap: '   \t\n ',
      keyDecisions: 'Use OAuth2',
      userRequest: 'I want auth',
    });
    expect(result.source).toBe('decisions');
    expect(result.text).toBe('Use OAuth2');
  });

  it('chooses user request when both AI recap and decisions are absent', () => {
    const result = selectGoalSource({
      aiRecap: '',
      keyDecisions: '',
      userRequest: 'I want to add auth',
    });
    expect(result.source).toBe('user');
    expect(result.text).toBe('I want to add auth');
  });

  it('skips whitespace-only decisions and falls back to user request', () => {
    const result = selectGoalSource({
      aiRecap: '',
      keyDecisions: '   ',
      userRequest: 'Add a login page',
    });
    expect(result.source).toBe('user');
    expect(result.text).toBe('Add a login page');
  });

  it('strips bullet prefixes from decisions and joins with semicolons', () => {
    const result = selectGoalSource({
      aiRecap: '',
      keyDecisions: ['- Use JWT', '* Role-based access', '1. Refresh tokens'],
      userRequest: 'auth feature',
    });
    expect(result.source).toBe('decisions');
    expect(result.text).toBe('Use JWT; Role-based access; Refresh tokens');
  });

  it('handles decisions as an array', () => {
    const result = selectGoalSource({
      aiRecap: '',
      keyDecisions: ['Support OAuth2', 'Add MFA'],
      userRequest: 'I want auth',
    });
    expect(result.source).toBe('decisions');
    expect(result.text).toBe('Support OAuth2; Add MFA');
  });

  it('normalizes whitespace in AI recap', () => {
    const result = selectGoalSource({
      aiRecap: '  You want  to  build   a dashboard. ',
      keyDecisions: '',
      userRequest: '',
    });
    expect(result.source).toBe('ai');
    expect(result.text).toBe('You want to build a dashboard.');
  });

  it('normalizes whitespace in user request', () => {
    const result = selectGoalSource({
      aiRecap: '',
      keyDecisions: [],
      userRequest: '  add  dark  mode ',
    });
    expect(result.source).toBe('user');
    expect(result.text).toBe('add dark mode');
  });
});

// ---------------------------------------------------------------------------
// polishGoalSentence
// ---------------------------------------------------------------------------
describe('polishGoalSentence', () => {
  it('rewrites "I want to …" to imperative form', () => {
    const result = polishGoalSentence('I want to add a dark mode toggle.');
    // Strips "I want to", leaving "add …" which is already an imperative verb
    expect(result).toBe('Add a dark mode toggle.');
  });

  it('rewrites "We will …" to imperative form', () => {
    const result = polishGoalSentence('We will build a new dashboard.');
    // Strips "We will", leaving "build …" which is already an imperative verb
    expect(result).toBe('Build a new dashboard.');
  });

  it('rewrites "I\'d like to …" to imperative form', () => {
    const result = polishGoalSentence("I'd like to improve the search feature.");
    // Strips "I'd like to", leaving "improve …" which is already an imperative verb
    expect(result).toBe('Improve the search feature.');
  });

  it('rewrites "The goal is to …" to imperative form', () => {
    const result = polishGoalSentence('The goal is to refactor the auth module.');
    // Strips "The goal is to", leaving "refactor …" which is already an imperative verb
    expect(result).toBe('Refactor the auth module.');
  });

  it('prepends "Implement" when no imperative verb is found after stripping framing', () => {
    const result = polishGoalSentence('I want to achieve a faster build pipeline.');
    // Strips "I want to", leaving "achieve …" — not in allowed verbs list
    expect(result).toBe('Implement achieve a faster build pipeline.');
  });

  it('passes through text already starting with an allowed imperative verb', () => {
    const result = polishGoalSentence('Add a user authentication system.');
    expect(result).toBe('Add a user authentication system.');
  });

  it('passes through "Implement …" unchanged (case insensitive match)', () => {
    const result = polishGoalSentence('Implement OAuth2 login flow.');
    expect(result).toBe('Implement OAuth2 login flow.');
  });

  it('ensures trailing period when missing', () => {
    const result = polishGoalSentence('Add a dark mode toggle');
    expect(result).toMatch(/\.$/);
  });

  it('does not double-add a trailing period', () => {
    const result = polishGoalSentence('Add a dark mode toggle.');
    expect(result).toBe('Add a dark mode toggle.');
    expect(result.endsWith('..')).toBe(false);
  });

  it('strips trailing ellipsis before adding period', () => {
    const result = polishGoalSentence('Add a dark mode toggle...');
    expect(result).toBe('Add a dark mode toggle.');
  });

  it('strips single trailing unicode ellipsis', () => {
    const result = polishGoalSentence('Add dark mode\u2026');
    expect(result).toBe('Add dark mode.');
  });

  it('collapses multi-sentence text into one sentence', () => {
    const result = polishGoalSentence(
      'Implement dark mode toggle. It should work on all pages. Users can save their preference.'
    );
    // Should only contain the first sentence
    expect(result).toBe('Implement dark mode toggle.');
  });

  it('ensures non-verbatim output for typical multi-clause user input', () => {
    const input = 'I want to build a feature that tracks user activity across sessions';
    const result = polishGoalSentence(input);
    const normalizedInput = input.replace(/\s+/g, ' ').trim();
    expect(result).not.toBe(normalizedInput);
    expect(result).not.toBe(normalizedInput + '.');
  });

  it('handles empty input gracefully', () => {
    const result = polishGoalSentence('');
    expect(result).toBe('Implement the requested feature.');
  });

  it('handles whitespace-only input gracefully', () => {
    const result = polishGoalSentence('   \n\t  ');
    expect(result).toBe('Implement the requested feature.');
  });

  it('capitalises first letter', () => {
    const result = polishGoalSentence('add a login form');
    expect(result.charAt(0)).toBe(result.charAt(0).toUpperCase());
  });

  it('preserves abbreviations inside a sentence (does not split on "e.g.")', () => {
    const result = polishGoalSentence(
      'Add user settings, e.g. theme and language preferences.'
    );
    // The sentence should not be incorrectly split at "e.g."
    expect(result).toContain('e.g.');
  });

  it('collapses multi-space/newline whitespace', () => {
    const result = polishGoalSentence('Add   dark\n\nmode  toggle.');
    expect(result).toBe('Add dark mode toggle.');
  });

  it('rewrites "This spec covers …" to imperative', () => {
    const result = polishGoalSentence('This spec covers the notification system.');
    expect(result).toBe('Implement the notification system.');
  });

  it('output always ends with exactly one period', () => {
    const cases = [
      'Add feature',
      'Add feature.',
      'Add feature!',
      'Add feature?',
      'I want to add feature',
    ];
    for (const c of cases) {
      const result = polishGoalSentence(c);
      expect(result.endsWith('.')).toBe(true);
      expect(result.endsWith('..')).toBe(false);
    }
  });
});
