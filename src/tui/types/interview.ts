/**
 * Interview flow types for multi-select questions and answers
 */

/**
 * A single option in a multi-select interview question
 */
export interface InterviewOption {
	/** Identifier for the option, as provided by the AI */
	id: string;
	/** Display label for the option */
	label: string;
}

/**
 * A structured interview question with multi-select options
 */
export interface InterviewQuestion {
	/** Unique identifier for the question */
	id: string;
	/** Question text displayed to the user */
	text: string;
	/** List of options for the user to select from */
	readonly options: readonly InterviewOption[];
}

/**
 * Discriminated union representing an answer to an interview question
 */
export type InterviewAnswer =
	| {
			mode: 'multiSelect';
			questionId: string;
			readonly selectedOptionIds: readonly string[];
	  }
	| {
			mode: 'freeText';
			questionId: string;
			text: string;
	  };

/**
 * Map selected option IDs to their labels, falling back to raw IDs for unmatched entries
 */
export function resolveOptionLabels(
	options: readonly InterviewOption[],
	selectedIds: readonly string[],
): string[] {
	return selectedIds.map(id => {
		const option = options.find(opt => opt.id === id);
		return option?.label ?? id;
	});
}
