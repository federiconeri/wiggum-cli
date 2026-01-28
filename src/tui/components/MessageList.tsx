/**
 * MessageList - Conversation history display
 *
 * Displays the full conversation history with clean formatting:
 * - User messages: › prefix
 * - Assistant messages: ● bullet with clean markdown-like styling
 * - Tool calls: Inline action indicators
 */

import React from 'react';
import { Box, Text } from 'ink';
import { colors, theme } from '../theme.js';
import { StreamingText } from './StreamingText.js';
import { ToolCallCard, type ToolCallStatus } from './ToolCallCard.js';

/**
 * Tool call information for assistant messages
 */
export interface ToolCall {
  /** Name of the tool being executed */
  toolName: string;
  /** Current execution status */
  status: ToolCallStatus;
  /** Input passed to the tool */
  input: string;
  /** Output when complete */
  output?: string;
  /** Error message if failed */
  error?: string;
}

/**
 * Message in the conversation history
 */
export interface Message {
  /** Unique identifier for the message */
  id: string;
  /** Who sent the message */
  role: 'user' | 'assistant' | 'system';
  /** Text content of the message */
  content: string;
  /** Tool calls included in assistant messages */
  toolCalls?: ToolCall[];
  /** Whether this message is currently streaming */
  isStreaming?: boolean;
}

/**
 * Props for the MessageList component
 */
export interface MessageListProps {
  /** Array of messages to display */
  messages: Message[];
  /** Optional max height in lines (for future scrolling support) */
  maxHeight?: number;
  /** Whether tool calls should show expanded preview (default: false) */
  toolCallsExpanded?: boolean;
}

/**
 * Renders a single user message with › prefix in green
 */
function UserMessage({ content }: { content: string }): React.ReactElement {
  return (
    <Box flexDirection="row" marginY={1}>
      <Text color={theme.colors.prompt} bold>
        {theme.chars.prompt}{' '}
      </Text>
      <Text color={theme.colors.userText}>{content}</Text>
    </Box>
  );
}

/**
 * Renders a single assistant message with tool calls (no prefix - distinguished by color)
 * Differentiates between thinking/context (solid LED, italic) and questions (bold with prefix)
 * Preserves original paragraph order while styling differently
 */
function AssistantMessage({
  content,
  toolCalls,
  isStreaming,
  toolCallsExpanded = false,
}: {
  content: string;
  toolCalls?: ToolCall[];
  isStreaming?: boolean;
  toolCallsExpanded?: boolean;
}): React.ReactElement {
  // Split content into paragraphs for differentiated styling
  const paragraphs = content ? content.split('\n\n').filter((p) => p.trim()) : [];

  return (
    <Box flexDirection="column" marginY={1}>
      {/* Tool calls appear first, dimmed */}
      {toolCalls && toolCalls.length > 0 && (
        <Box flexDirection="column" marginBottom={1}>
          {toolCalls.map((toolCall, index) => (
            <ToolCallCard
              key={`tool-${index}`}
              toolName={toolCall.toolName}
              status={toolCall.status}
              input={toolCall.input}
              output={toolCall.output}
              error={toolCall.error}
              expanded={toolCallsExpanded}
            />
          ))}
        </Box>
      )}

      {/* Message content - single pass preserving order, style context vs questions differently */}
      {content && !isStreaming && (
        <Box flexDirection="column" flexGrow={1}>
          {paragraphs.map((para, index) => {
            const isQuestion = para.trim().endsWith('?');

            if (isQuestion) {
              // Question - prominent, with "Next question:" prefix
              return (
                <Box key={index} marginY={1} flexDirection="column">
                  <Text bold>Next question:</Text>
                  <Text color={theme.colors.aiText}>{para}</Text>
                </Box>
              );
            } else {
              // Context/thinking - solid grey LED, italic dimmed text
              return (
                <Box key={index} flexDirection="row" gap={1}>
                  <Text dimColor>●</Text>
                  <Text dimColor italic>{para}</Text>
                </Box>
              );
            }
          })}
        </Box>
      )}

      {/* Streaming content */}
      {content && isStreaming && (
        <Box flexDirection="column" flexGrow={1}>
          <StreamingText text={content} isStreaming={true} color={theme.colors.aiText} />
        </Box>
      )}
    </Box>
  );
}

/**
 * Renders a system message
 * Phase headers get bold yellow styling, other system messages are dimmed
 */
function SystemMessage({ content }: { content: string }): React.ReactElement {
  // Check if this is a phase header (e.g., "Phase 2: Goals - Describe what you want to build")
  const phaseMatch = content.match(/^Phase (\d+): (.+?) - (.+)$/);

  if (phaseMatch) {
    const [, phaseNum, phaseName, description] = phaseMatch;
    return (
      <Box marginY={1} flexDirection="column">
        <Text color={theme.colors.brand} bold>Phase {phaseNum}: {phaseName}</Text>
        <Text dimColor>{description}</Text>
      </Box>
    );
  }

  return (
    <Box marginY={1}>
      <Text dimColor>{content}</Text>
    </Box>
  );
}

/**
 * MessageList component
 *
 * Displays the full conversation history with clean styling:
 * - User messages: `› ` prefix in blue
 * - Assistant messages: `● ` prefix in yellow, with inline tool cards
 * - System messages: dimmed text
 *
 * @example
 * ```tsx
 * <MessageList
 *   messages={[
 *     { id: '1', role: 'user', content: 'Hello' },
 *     { id: '2', role: 'assistant', content: 'Hi! How can I help?' },
 *   ]}
 * />
 * // Renders:
 * // › Hello
 * // ● Hi! How can I help?
 * ```
 */
export function MessageList({
  messages,
  maxHeight,
  toolCallsExpanded = false,
}: MessageListProps): React.ReactElement {
  return (
    <Box
      flexDirection="column"
      {...(maxHeight ? { height: maxHeight } : {})}
    >
      {messages.map((message) => {
        switch (message.role) {
          case 'user':
            return <UserMessage key={message.id} content={message.content} />;
          case 'assistant':
            return (
              <AssistantMessage
                key={message.id}
                content={message.content}
                toolCalls={message.toolCalls}
                isStreaming={message.isStreaming}
                toolCallsExpanded={toolCallsExpanded}
              />
            );
          case 'system':
            return <SystemMessage key={message.id} content={message.content} />;
        }
      })}
    </Box>
  );
}
