import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { Text } from 'ink';
import { render } from 'ink-testing-library';
import {
  normalizeRecap,
  normalizeUserDecision,
  summarizeText,
  isUsefulDecision,
  extractRecap,
  SpecCompletionSummary,
} from './SpecCompletionSummary.js';
import { stripAnsi } from '../../__test-utils__/ink-helpers.js';
import type { Message } from './MessageList.js';

// Mock useSpecGenerator for PHASE_CONFIGS
vi.mock('../hooks/useSpecGenerator.js', () => ({
  PHASE_CONFIGS: {
    context: { name: 'Context', number: 1 },
    goals: { name: 'Goals', number: 2 },
    interview: { name: 'Interview', number: 3 },
    generation: { name: 'Generation', number: 4 },
    complete: { name: 'Complete', number: 5 },
  },
}));

describe('normalizeRecap', () => {
  it('strips leading non-alphanumeric chars', () => {
    expect(normalizeRecap('-- Hello world')).toBe('Hello world');
  });

  it('strips "you want" prefix', () => {
    expect(normalizeRecap('you want to build a REST API')).toBe('To build a REST API');
  });

  it('strips "understood" prefix', () => {
    expect(normalizeRecap('understood, building a CLI tool')).toBe('Building a CLI tool');
  });

  it('strips "got it" prefix', () => {
    expect(normalizeRecap('got it: using React for the frontend')).toBe('Using React for the frontend');
    expect(normalizeRecap('got it— using React for the frontend')).toBe('Using React for the frontend');
  });

  it('capitalizes the first character', () => {
    expect(normalizeRecap('  hello')).toBe('Hello');
  });
});

describe('normalizeUserDecision', () => {
  it('strips "I want to" prefix', () => {
    expect(normalizeUserDecision('I want to use TypeScript')).toBe('Use TypeScript.');
  });

  it('strips "I would like" prefix', () => {
    expect(normalizeUserDecision('I would like dark mode support')).toBe('Dark mode support.');
  });

  it('strips "please" prefix', () => {
    expect(normalizeUserDecision('please add validation')).toBe('Add validation.');
  });

  it('strips "up to you" prefix', () => {
    expect(normalizeUserDecision('up to you, whatever works')).toBe('Whatever works.');
  });

  it('adds trailing period if missing', () => {
    expect(normalizeUserDecision('use REST endpoints')).toBe('Use REST endpoints.');
  });

  it('does not add period if already present', () => {
    expect(normalizeUserDecision('use REST endpoints.')).toBe('Use REST endpoints.');
  });

  it('capitalizes first character', () => {
    expect(normalizeUserDecision('both options are fine')).toBe('Both options are fine.');
  });
});

describe('summarizeText', () => {
  it('returns short text unchanged', () => {
    expect(summarizeText('hello', 160)).toBe('hello');
  });

  it('truncates long text with ellipsis', () => {
    const longText = 'a'.repeat(200);
    const result = summarizeText(longText, 50);
    expect(result.length).toBe(50);
    expect(result.endsWith('\u2026')).toBe(true);
  });

  it('uses default max of 160', () => {
    const text = 'a'.repeat(200);
    const result = summarizeText(text);
    expect(result.length).toBe(160);
  });
});

describe('isUsefulDecision', () => {
  it('rejects short text', () => {
    expect(isUsefulDecision('yes')).toBe(false);
    expect(isUsefulDecision('no')).toBe(false);
    expect(isUsefulDecision('ok')).toBe(false);
  });

  it('rejects few-word text', () => {
    expect(isUsefulDecision('just two')).toBe(false);
  });

  it('accepts substantive decisions', () => {
    expect(isUsefulDecision('use React with TypeScript for the frontend')).toBe(true);
  });

  it('rejects bare "okay"', () => {
    expect(isUsefulDecision('okay')).toBe(false);
  });

  it('rejects bare "both"', () => {
    expect(isUsefulDecision('both')).toBe(false);
  });
});

describe('extractRecap', () => {
  function msg(role: string, content: string): Message {
    return { id: `msg-${Math.random()}`, role: role as Message['role'], content };
  }

  it('falls back to feature name when no messages', () => {
    const result = extractRecap([], 'my-feature');
    // polishGoalSentence normalises to an imperative sentence with trailing period
    expect(result.goalCandidate).toContain('my-feature');
    expect(result.decisions).toEqual([]);
  });

  it('extracts goal from assistant recap', () => {
    const messages = [
      msg('user', 'Build a REST API for user management'),
      msg('assistant', 'You want to build a REST API for managing users. Next question: what framework?'),
    ];
    const result = extractRecap(messages, 'user-api');
    expect(result.goalCandidate).toContain('REST API');
  });

  it('extracts goal from user message when no recap', () => {
    const messages = [
      msg('user', 'Build a CLI tool that generates reports from CSV data'),
    ];
    const result = extractRecap(messages, 'report-gen');
    expect(result.goalCandidate).toContain('CLI tool');
  });

  it('extracts decisions from multiple recap paragraphs', () => {
    const messages = [
      msg('user', 'Build a web app'),
      msg('assistant', 'You want to build a web application for task management.'),
      msg('user', 'Use React and TypeScript'),
      msg('assistant', 'Understood, using React with TypeScript for the frontend. Next question: what about the backend?'),
      msg('user', 'Use Express with PostgreSQL'),
      msg('assistant', 'Got it - Express with PostgreSQL for the backend API.'),
    ];
    const result = extractRecap(messages, 'task-app');
    expect(result.decisions.length).toBeGreaterThan(0);
  });

  it('skips URL-only user messages', () => {
    const messages = [
      msg('user', 'https://example.com/api-docs'),
      msg('user', 'Build a REST API'),
    ];
    const result = extractRecap(messages, 'api');
    expect(result.goalCandidate).not.toContain('https://');
  });
});

describe('SpecCompletionSummary component', () => {
  function msg(role: string, content: string): Message {
    return { id: `msg-${Math.random()}`, role: role as Message['role'], content };
  }

  it('renders feature name, spec preview, and what\'s next', () => {
    const spec = '# Feature Spec\n\nThis is a test spec.\n\n## Goals\n\nBuild something.\n\n## Tasks\n\n- Task 1\n- Task 2';
    const messages = [
      msg('user', 'Build a test feature with multiple components'),
    ];

    const { lastFrame, unmount } = render(
      <SpecCompletionSummary
        featureName="test-feature"
        spec={spec}
        specPath="/tmp/specs/test-feature.md"
        messages={messages}
      />,
    );

    const frame = stripAnsi(lastFrame() ?? '');
    expect(frame).toContain('test-feature');
    expect(frame).toContain('Summary');
    expect(frame).toContain('Goal:');
    expect(frame).toContain("What's next:");
    expect(frame).toContain('Enter or Esc');
    unmount();
  });

  it('shows spec line count', () => {
    const spec = 'line1\nline2\nline3';
    const { lastFrame, unmount } = render(
      <SpecCompletionSummary
        featureName="feat"
        spec={spec}
        specPath="specs/feat.md"
        messages={[]}
      />,
    );

    const frame = stripAnsi(lastFrame() ?? '');
    expect(frame).toContain('3 lines');
    unmount();
  });

  it('renders full Goal text without truncation for long goals', () => {
    // Construct a long user message (> 160 chars)
    const longGoal = 'Add a comprehensive user authentication system with JWT tokens, refresh token rotation, role-based access control, and a secure password reset flow via email with expiring links.';
    expect(longGoal.length).toBeGreaterThan(160);

    const messages = [
      { id: 'msg-1', role: 'user' as const, content: longGoal },
    ];

    const { lastFrame, unmount } = render(
      <SpecCompletionSummary
        featureName="auth-system"
        spec="# Auth Spec\n\nContent here."
        specPath="specs/auth-system.md"
        messages={messages}
      />,
    );

    const frame = stripAnsi(lastFrame() ?? '');
    // The key distinguishing words from the long goal should all be present
    expect(frame).toContain('authentication');
    expect(frame).toContain('JWT');
    // Should NOT be truncated with ellipsis mid-sentence
    expect(frame).not.toMatch(/\u2026\s*$/m);
    unmount();
  });

  it('Goal line starts with an imperative verb', () => {
    const messages = [
      { id: 'msg-1', role: 'user' as const, content: 'I want to build a dashboard for tracking metrics' },
    ];

    const { lastFrame, unmount } = render(
      <SpecCompletionSummary
        featureName="dashboard"
        spec="# Dashboard Spec"
        specPath="specs/dashboard.md"
        messages={messages}
      />,
    );

    const frame = stripAnsi(lastFrame() ?? '');
    const goalLineMatch = frame.match(/- Goal: (.+)/);
    expect(goalLineMatch).not.toBeNull();
    const goalText = goalLineMatch![1]!;
    const imperativeVerbs = /^(Implement|Add|Improve|Fix|Refactor|Support|Enable|Create|Update|Build|Extend|Migrate|Remove|Replace|Integrate|Define)\b/i;
    expect(goalText).toMatch(imperativeVerbs);
    unmount();
  });

  it('renders without errors when messages are empty (graceful degradation)', () => {
    const { lastFrame, unmount } = render(
      <SpecCompletionSummary
        featureName="empty-feature"
        spec="# Spec"
        specPath="specs/empty-feature.md"
        messages={[]}
      />,
    );

    const frame = stripAnsi(lastFrame() ?? '');
    expect(frame).toContain('Goal:');
    expect(frame).toContain('empty-feature');
    unmount();
  });
});
