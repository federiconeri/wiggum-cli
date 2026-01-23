/**
 * MessageList - Scrollable conversation history display
 *
 * Displays the full conversation history including:
 * - User messages
 * - Assistant messages (with optional streaming)
 * - System messages
 * - Tool call cards inline with assistant messages
 */

import React from 'react';
import { Box, Text } from 'ink';
import { colors } from '../theme.js';
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
}

/**
 * Renders a single user message
 */
function UserMessage({ content }: { content: string }): React.ReactElement {
  return (
    <Box flexDirection="row" marginY={1}>
      <Text color={colors.white} bold>
        You:{' '}
      </Text>
      <Text color={colors.white}>{content}</Text>
    </Box>
  );
}

/**
 * Renders a single assistant message with optional tool calls and streaming
 */
function AssistantMessage({
  content,
  toolCalls,
  isStreaming,
}: {
  content: string;
  toolCalls?: ToolCall[];
  isStreaming?: boolean;
}): React.ReactElement {
  return (
    <Box flexDirection="column" marginY={1}>
      {/* Tool calls appear before the message content */}
      {toolCalls &&
        toolCalls.length > 0 &&
        toolCalls.map((toolCall, index) => (
          <Box key={`tool-${index}`} marginBottom={1}>
            <ToolCallCard
              toolName={toolCall.toolName}
              status={toolCall.status}
              input={toolCall.input}
              output={toolCall.output}
              error={toolCall.error}
            />
          </Box>
        ))}

      {/* Message content with prefix */}
      <Box flexDirection="row">
        <Text color={colors.yellow} bold>
          AI:{' '}
        </Text>
        {isStreaming ? (
          <StreamingText text={content} isStreaming={true} color={colors.yellow} />
        ) : (
          <Text color={colors.yellow}>{content}</Text>
        )}
      </Box>
    </Box>
  );
}

/**
 * Renders a system message (dimmed text)
 */
function SystemMessage({ content }: { content: string }): React.ReactElement {
  return (
    <Box flexDirection="row" marginY={1}>
      <Text color={colors.brown} dimColor>
        {content}
      </Text>
    </Box>
  );
}

/**
 * MessageList component
 *
 * Displays the full conversation history. Each message type has
 * distinct styling:
 * - User messages: "You: " prefix in white
 * - Assistant messages: "AI: " prefix in yellow, with inline tool cards
 * - System messages: dimmed brown text
 *
 * For streaming messages, uses the StreamingText component to show
 * the cursor indicator.
 *
 * @example
 * ```tsx
 * <MessageList
 *   messages={[
 *     { id: '1', role: 'system', content: 'Interview started' },
 *     { id: '2', role: 'assistant', content: 'Hello! What would you like to build?' },
 *     { id: '3', role: 'user', content: 'A todo app' },
 *     { id: '4', role: 'assistant', content: 'Let me check...',
 *       toolCalls: [{ toolName: 'Read File', status: 'running', input: 'package.json' }],
 *       isStreaming: true
 *     },
 *   ]}
 * />
 * ```
 */
export function MessageList({ messages, maxHeight }: MessageListProps): React.ReactElement {
  // Note: maxHeight is accepted for future scrolling support
  // Currently renders all messages - parent handles any scroll-like behavior
  // by controlling which messages are passed in

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
              />
            );
          case 'system':
            return <SystemMessage key={message.id} content={message.content} />;
        }
      })}
    </Box>
  );
}
