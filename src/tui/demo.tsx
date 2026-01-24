#!/usr/bin/env node
/**
 * TUI Demo - Test the Ink components visually
 *
 * Run with: npx tsx src/tui/demo.tsx
 */

import React, { useState, useEffect } from 'react';
import { render, Box, Text, useInput } from 'ink';
import { PhaseHeader } from './components/PhaseHeader.js';
import { MessageList, type Message } from './components/MessageList.js';
import { WorkingIndicator } from './components/WorkingIndicator.js';
import { ChatInput } from './components/ChatInput.js';
import { colors } from './theme.js';

function Demo(): React.ReactElement {
  const [messages, setMessages] = useState<Message[]>([
    { id: '1', role: 'system', content: 'Spec Generator initialized for feature: demo-feature' },
    { id: '2', role: 'assistant', content: 'Welcome! Let\'s create a specification for your feature.' },
  ]);
  const [phase, setPhase] = useState(1);
  const [isWorking, setIsWorking] = useState(false);
  const [workingStatus, setWorkingStatus] = useState('');

  // Handle user input
  const handleSubmit = (value: string) => {
    // Add user message
    setMessages(prev => [...prev, {
      id: String(Date.now()),
      role: 'user' as const,
      content: value || '(empty - continue)',
    }]);

    // Simulate AI working
    setIsWorking(true);
    setWorkingStatus('Thinking...');

    setTimeout(() => {
      // Simulate tool call
      setMessages(prev => [...prev, {
        id: String(Date.now()),
        role: 'assistant' as const,
        content: 'Great! Let me analyze that...',
        toolCalls: [{
          toolName: 'Read File',
          status: 'complete' as const,
          input: 'package.json',
          output: '42 lines read',
        }],
      }]);

      setIsWorking(false);
      setPhase(p => Math.min(p + 1, 4));
    }, 1500);
  };

  // Handle escape to exit
  useInput((input, key) => {
    if (key.escape) {
      process.exit(0);
    }
  });

  const phaseNames = ['Context', 'Goals', 'Interview', 'Generation'];

  return (
    <Box flexDirection="column" padding={1}>
      <Box marginBottom={1}>
        <Text color={colors.yellow} bold>Ink TUI Demo</Text>
        <Text color={colors.brown}> - Press Esc to exit</Text>
      </Box>

      <PhaseHeader
        currentPhase={phase}
        totalPhases={4}
        phaseName={phaseNames[phase - 1]}
      />

      <Box marginY={1}>
        <MessageList messages={messages} />
      </Box>

      <Box marginY={1}>
        <WorkingIndicator
          state={{
            isWorking,
            status: workingStatus,
            hint: 'esc to cancel',
          }}
        />
      </Box>

      <Box marginTop={1}>
        <ChatInput
          onSubmit={handleSubmit}
          disabled={isWorking}
          allowEmpty={phase === 1}
          placeholder={
            phase === 1
              ? 'Enter URL or file path, or press Enter to continue...'
              : 'Type your response...'
          }
        />
      </Box>
    </Box>
  );
}

// Render the demo
console.clear();
render(<Demo />);
