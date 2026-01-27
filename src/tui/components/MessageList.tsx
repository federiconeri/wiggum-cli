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

      {/* Message content - AI text in Simpson yellow, no prefix */}
      {content && (
        <Box flexDirection="column" flexGrow={1}>
          {isStreaming ? (
            <StreamingText text={content} isStreaming={true} color={theme.colors.aiText} />
          ) : (
            <Text color={theme.colors.aiText}>{content}</Text>
          )}
        </Box>
      )}
    </Box>
  );
}

/**
 * Renders a system message (dimmed, no prefix)
 */
function SystemMessage({ content }: { content: string }): React.ReactElement {
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
