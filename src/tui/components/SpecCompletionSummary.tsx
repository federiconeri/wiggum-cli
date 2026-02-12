/**
 * SpecCompletionSummary - Displays spec generation recap
 *
 * Shows the goal, key decisions, file preview, and "what's next"
 * section after a spec has been generated. Extracts a recap from
 * the conversation history using regex-based pattern matching.
 */

import React from 'react';
import { Box, Text } from 'ink';
import { StatusLine } from './StatusLine.js';
import { colors, theme } from '../theme.js';
import { PHASE_CONFIGS } from '../hooks/useSpecGenerator.js';
import type { Message } from './MessageList.js';

/**
 * Props for the SpecCompletionSummary component
 */
export interface SpecCompletionSummaryProps {
  /** Name of the feature */
  featureName: string;
  /** Generated spec content */
  spec: string;
  /** Path where spec was saved */
  specPath: string;
  /** Conversation messages from the interview */
  messages: Message[];
}

const MAX_RECAP_SOURCE_LENGTH = 1200;

/** Strip filler prefixes ('you want', 'understood', 'got it') from AI recap text and capitalize. */
export function normalizeRecap(text: string): string {
  let result = text.trim();
  result = result.replace(/^[^a-z0-9]+/i, '');
  result = result.replace(/^you want\s*/i, '');
  result = result.replace(/^understood[:,]?\s*/i, '');
  result = result.replace(/^got it[-\u2014:]*\s*/i, '');
  return result.charAt(0).toUpperCase() + result.slice(1);
}

/** Strip user speech filler and normalize decision text: add trailing period if missing, capitalize. */
export function normalizeUserDecision(text: string): string {
  let result = text.trim();
  result = result.replace(/^[^a-z0-9]+/i, '');
  result = result.replace(/^i (?:would like|want|need|prefer|expect) to\s*/i, '');
  result = result.replace(/^i (?:would like|want|need|prefer|expect)\s*/i, '');
  result = result.replace(/^please\s*/i, '');
  result = result.replace(/^up to you[:,]?\s*/i, '');
  result = result.replace(/^both\s*/i, 'Both ');
  if (result && !/[.!?]$/.test(result)) {
    result += '.';
  }
  return result.charAt(0).toUpperCase() + result.slice(1);
}

/** Truncate text to max characters with ellipsis. */
export function summarizeText(text: string, max = 160): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}\u2026`;
}

/** Return true if the decision string is substantive enough to display (>= 8 chars, >= 3 words, not bare yes/no). */
export function isUsefulDecision(entry: string): boolean {
  const normalized = entry.trim().toLowerCase();
  if (normalized.length < 8) return false;
  const wordCount = normalized.split(/\s+/).length;
  if (wordCount < 3) return false;
  if (['yes', 'no', 'both', 'ok', 'okay'].includes(normalized)) return false;
  return true;
}

/**
 * Extract goal and key decisions from conversation messages
 */
export function extractRecap(messages: Message[], featureName: string) {
  const userMessages = messages
    .filter((msg) => msg.role === 'user')
    .map((msg) => msg.content.trim())
    .filter((content) => content.length > 0 && content.length <= MAX_RECAP_SOURCE_LENGTH);

  const nonUrlUserMessages = userMessages.filter(
    (content) => !/^https?:\/\//i.test(content) && !/^www\./i.test(content)
  );

  const assistantParagraphs = messages
    .filter((msg) => msg.role === 'assistant' && msg.content && msg.content.length <= MAX_RECAP_SOURCE_LENGTH)
    .flatMap((msg) => msg.content.split('\n\n'))
    .map((para) => para.replace(/\s+/g, ' ').trim())
    .filter((para) => para.length > 0 && para.length <= 320);

  const recapCandidates = assistantParagraphs
    .map((para) => para.replace(/^[^a-z0-9]+/i, '').trim())
    .filter((para) => /^(you want|understood|got it)/i.test(para))
    .map((para) => para.split(/next question:/i)[0]!.trim())
    .filter((para) => para.length > 0);

  const goalCandidate = recapCandidates.length > 0
    ? normalizeRecap(recapCandidates[0]!)
    : (nonUrlUserMessages.find((content) => content.length > 20)
      ? normalizeUserDecision(nonUrlUserMessages.find((content) => content.length > 20)!)
      : (nonUrlUserMessages[0] ? normalizeUserDecision(nonUrlUserMessages[0]) : `Define "${featureName}"`));

  const decisions: string[] = [];
  const seen = new Set<string>();

  if (recapCandidates.length > 1) {
    for (let i = 1; i < recapCandidates.length; i += 1) {
      const entry = normalizeRecap(recapCandidates[i]!);
      const normalized = entry.toLowerCase();
      if (!isUsefulDecision(entry)) continue;
      if (seen.has(normalized)) continue;
      decisions.push(entry);
      seen.add(normalized);
      if (decisions.length >= 4) break;
    }
  } else {
    for (let i = nonUrlUserMessages.length - 1; i >= 0; i -= 1) {
      const entry = nonUrlUserMessages[i]!;
      const normalized = entry.toLowerCase();
      if (entry === goalCandidate) continue;
      if (!isUsefulDecision(entry)) continue;
      if (entry.length > 160) continue;
      if (seen.has(normalized)) continue;
      decisions.unshift(normalizeUserDecision(entry));
      seen.add(normalized);
      if (decisions.length >= 4) break;
    }
  }

  return { goalCandidate, decisions };
}

/**
 * SpecCompletionSummary component
 *
 * Renders the spec generation completion recap inline within the
 * InterviewScreen content area.
 */
export function SpecCompletionSummary({
  featureName,
  spec,
  specPath,
  messages,
}: SpecCompletionSummaryProps): React.ReactElement {
  const specLines = spec ? spec.split('\n') : [];
  const totalLines = specLines.length;
  const previewLines = specLines.slice(0, 5);
  const remainingLines = Math.max(0, totalLines - 5);

  const { goalCandidate, decisions } = extractRecap(messages, featureName);

  return (
    <Box flexDirection="column" marginY={1}>
      <StatusLine
        action="New Spec"
        phase={`Complete (${PHASE_CONFIGS.complete.number}/${PHASE_CONFIGS.complete.number})`}
        path={featureName}
      />
      <Box marginTop={1} flexDirection="column">
        <Text bold>Summary</Text>
        <Text>- Goal: {summarizeText(goalCandidate)}</Text>
        <Text>- Outcome: Spec written to {specPath || `${featureName}.md`} ({totalLines} lines)</Text>
      </Box>

      {decisions.length > 0 && (
        <Box marginTop={1} flexDirection="column">
          <Text bold>Key decisions</Text>
          {decisions.map((decision, idx) => (
            <Text key={`${decision}-${idx}`}>{idx + 1}. {summarizeText(decision, 120)}</Text>
          ))}
        </Box>
      )}

      {/* Tool-call style preview */}
      <Box marginTop={1} flexDirection="row">
        <Text color={colors.green}>{theme.chars.bullet} </Text>
        <Text bold>Write</Text>
        <Text dimColor>({specPath || `${featureName}.md`})</Text>
      </Box>
      <Box marginLeft={2}>
        <Text dimColor>{theme.chars.lineEnd} Wrote {totalLines} lines</Text>
      </Box>

      {/* Preview with line numbers */}
      <Box marginLeft={4} flexDirection="column">
        {previewLines.map((line, i) => (
          <Box key={i} flexDirection="row">
            <Text dimColor>{String(i + 1).padStart(4)} </Text>
            <Text dimColor>{line}</Text>
          </Box>
        ))}
        {remainingLines > 0 && (
          <Text dimColor>{'\u2026'} +{remainingLines} lines</Text>
        )}
      </Box>

      {/* Done message */}
      <Box marginTop={1} flexDirection="row">
        <Text color={colors.green}>{theme.chars.bullet} </Text>
        <Text>Done. Specification generated successfully.</Text>
      </Box>

      {/* What's next */}
      <Box marginTop={1} flexDirection="column">
        <Text bold>What's next:</Text>
        <Box flexDirection="row" gap={1}>
          <Text color={colors.green}>{theme.chars.prompt}</Text>
          <Text dimColor>Review the spec in your editor</Text>
        </Box>
        <Box flexDirection="row" gap={1}>
          <Text color={colors.green}>{theme.chars.prompt}</Text>
          <Text color={colors.blue}>/help</Text>
          <Text dimColor>See all commands</Text>
        </Box>
      </Box>

      <Box marginTop={1}>
        <Text dimColor>Press Enter or Esc to return to shell</Text>
      </Box>
    </Box>
  );
}
