/**
 * MultiSelect - Checkbox-style multi-select component
 *
 * Displays a list of options with checkboxes that can be toggled.
 * Press Space to toggle selection, Enter to submit, c for chat mode, Escape to cancel.
 */

import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { colors } from '../theme.js';
import type { SelectOption } from './Select.js';

/**
 * Props for the MultiSelect component
 */
export interface MultiSelectProps {
	/** The message/question to display */
	message: string;
	/** Available options */
	options: SelectOption<string>[];
	/** Called when user submits selected values */
	onSubmit: (selectedValues: string[]) => void;
	/** Called when user wants to switch to chat mode */
	onChatMode?: () => void;
	/** Called when user cancels (Escape) */
	onCancel?: () => void;
	/** Initial focused index (default: 0) */
	initialIndex?: number;
}

/**
 * MultiSelect component
 *
 * Checkbox-style multi-selection list. Use up/down arrows or j/k to navigate,
 * Space to toggle selection, Enter to submit selected values, c to switch to chat mode,
 * Escape to cancel.
 *
 * @example
 * ```tsx
 * <MultiSelect
 *   message="Which features do you need?"
 *   options={[
 *     { value: 'auth', label: 'Authentication' },
 *     { value: 'db', label: 'Database' },
 *     { value: 'api', label: 'API endpoints' },
 *   ]}
 *   onSubmit={(values) => handleAnswer(values)}
 *   onChatMode={() => switchToFreeText()}
 *   onCancel={() => goBack()}
 * />
 * ```
 */
export function MultiSelect({
	message,
	options,
	onSubmit,
	onChatMode,
	onCancel,
	initialIndex = 0,
}: MultiSelectProps): React.ReactElement {
	const [focusedIndex, setFocusedIndex] = useState(initialIndex);
	const [selectedValues, setSelectedValues] = useState<Set<string>>(new Set());

	useInput((input, key) => {
		// Navigate up
		if (key.upArrow || input === 'k') {
			setFocusedIndex((prev) => (prev - 1 + options.length) % options.length);
			return;
		}

		// Navigate down
		if (key.downArrow || input === 'j') {
			setFocusedIndex((prev) => (prev + 1) % options.length);
			return;
		}

		// Toggle selection
		if (input === ' ') {
			const focusedOption = options[focusedIndex];
			if (focusedOption) {
				setSelectedValues((prev) => {
					const next = new Set(prev);
					if (next.has(focusedOption.value)) {
						next.delete(focusedOption.value);
					} else {
						next.add(focusedOption.value);
					}
					return next;
				});
			}
			return;
		}

		// Submit selected values
		if (key.return) {
			onSubmit(Array.from(selectedValues));
			return;
		}

		// Switch to chat mode
		if (input === 'c') {
			onChatMode?.();
			return;
		}

		// Cancel
		if (key.escape) {
			onCancel?.();
			return;
		}
	});

	return (
		<Box flexDirection="column">
			{/* Question */}
			<Box marginBottom={1}>
				<Text color={colors.yellow}>? </Text>
				<Text>{message}</Text>
			</Box>

			{/* Options with checkboxes */}
			<Box flexDirection="column">
				{options.map((option, index) => {
					const isFocused = index === focusedIndex;
					const isSelected = selectedValues.has(option.value);
					const checkbox = isSelected ? '[x]' : '[ ]';

					return (
						<Box key={option.value} paddingLeft={2}>
							<Text color={isFocused ? colors.blue : undefined}>
								{isFocused ? '❯ ' : '  '}
							</Text>
							<Text color={isFocused ? colors.blue : undefined}>
								{checkbox}{' '}
							</Text>
							<Text color={isFocused ? colors.blue : undefined}>
								{option.label}
							</Text>
							{option.hint && <Text dimColor> ({option.hint})</Text>}
						</Box>
					);
				})}
			</Box>

			{/* Keyboard hints */}
			<Box marginTop={1} paddingLeft={2}>
				<Text dimColor>
					(↑↓ move, Space toggle, Enter submit, c chat mode, Esc cancel)
				</Text>
			</Box>
		</Box>
	);
}
