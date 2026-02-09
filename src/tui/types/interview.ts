/**
 * Interview flow types for multi-select questions and answers
 */

/**
 * A single option in a multi-select interview question
 */
export interface InterviewOption {
	/** Stable identifier for the option */
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
	options: InterviewOption[];
}

/**
 * The mode of answer input for an interview question
 */
export type InterviewAnswerMode = 'multiSelect' | 'freeText';

/**
 * Discriminated union representing an answer to an interview question
 */
export type InterviewAnswer =
	| {
			mode: 'multiSelect';
			questionId: string;
			selectedOptionIds: string[];
	  }
	| {
			mode: 'freeText';
			questionId: string;
			text: string;
	  };
