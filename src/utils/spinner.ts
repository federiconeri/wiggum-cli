/**
 * Custom Spinner with Shimmer Effect, Timer, and Token Tracking
 * Inspired by Claude Code's loading experience
 */

import { simpson } from './colors.js';

/**
 * Shimmer frames for the spinner animation
 * Creates a wave-like effect similar to Claude Code
 */
const SHIMMER_FRAMES = [
  '░▒▓█▓▒░',
  '▒▓█▓▒░░',
  '▓█▓▒░░▒',
  '█▓▒░░▒▓',
  '▓▒░░▒▓█',
  '▒░░▒▓█▓',
  '░░▒▓█▓▒',
  '░▒▓█▓▒░',
];

/**
 * Braille spinner frames (alternative style)
 */
const BRAILLE_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

/**
 * Dots spinner frames
 */
const DOTS_FRAMES = ['⠁', '⠂', '⠄', '⡀', '⢀', '⠠', '⠐', '⠈'];

/**
 * Format milliseconds to human-readable time
 */
function formatTime(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;

  if (minutes > 0) {
    return `${minutes}m ${remainingSeconds}s`;
  }
  return `${seconds}s`;
}

/**
 * Format token count with commas
 */
function formatTokens(tokens: number): string {
  return tokens.toLocaleString();
}

export interface ShimmerSpinnerOptions {
  /** Enable shimmer effect (default: true) */
  shimmer?: boolean;
  /** Show elapsed time (default: true) */
  showTimer?: boolean;
  /** Show token usage (default: false) */
  showTokens?: boolean;
  /** Spinner style (default: 'shimmer') */
  style?: 'shimmer' | 'braille' | 'dots';
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

/**
 * Custom spinner with shimmer effect, timer, and token tracking
 */
export class ShimmerSpinner {
  private message: string = '';
  private isRunning: boolean = false;
  private intervalId: NodeJS.Timeout | null = null;
  private frameIndex: number = 0;
  private startTime: number = 0;
  private tokens: TokenUsage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
  private options: Required<ShimmerSpinnerOptions>;
  private frames: string[];

  constructor(options: ShimmerSpinnerOptions = {}) {
    this.options = {
      shimmer: options.shimmer ?? true,
      showTimer: options.showTimer ?? true,
      showTokens: options.showTokens ?? false,
      style: options.style ?? 'shimmer',
    };

    // Select frames based on style
    switch (this.options.style) {
      case 'braille':
        this.frames = BRAILLE_FRAMES;
        break;
      case 'dots':
        this.frames = DOTS_FRAMES;
        break;
      case 'shimmer':
      default:
        this.frames = SHIMMER_FRAMES;
        break;
    }
  }

  /**
   * Start the spinner with a message
   */
  start(message: string): void {
    this.message = message;
    this.isRunning = true;
    this.startTime = Date.now();
    this.frameIndex = 0;

    // Clear line and hide cursor
    process.stdout.write('\x1B[?25l');

    this.render();
    this.intervalId = setInterval(() => {
      this.frameIndex = (this.frameIndex + 1) % this.frames.length;
      this.render();
    }, 80);
  }

  /**
   * Update the spinner message
   */
  update(message: string): void {
    this.message = message;
  }

  /**
   * Update token usage (adds to existing)
   */
  updateTokens(usage: TokenUsage): void {
    this.tokens = {
      inputTokens: this.tokens.inputTokens + usage.inputTokens,
      outputTokens: this.tokens.outputTokens + usage.outputTokens,
      totalTokens: this.tokens.totalTokens + usage.totalTokens,
    };
  }

  /**
   * Set token usage directly
   */
  setTokens(usage: TokenUsage): void {
    this.tokens = usage;
  }

  /**
   * Render the spinner
   */
  private render(): void {
    if (!this.isRunning) return;

    const elapsed = Date.now() - this.startTime;
    const frame = this.frames[this.frameIndex];

    let line = '';

    // Shimmer/spinner frame
    if (this.options.shimmer && this.options.style === 'shimmer') {
      line += simpson.yellow(frame) + ' ';
    } else {
      line += simpson.yellow(frame) + ' ';
    }

    // Message
    line += this.message;

    // Timer
    if (this.options.showTimer) {
      line += simpson.brown(` [${formatTime(elapsed)}]`);
    }

    // Tokens
    if (this.options.showTokens && this.tokens.totalTokens > 0) {
      line += simpson.pink(` (${formatTokens(this.tokens.totalTokens)} tokens)`);
    }

    // Clear line and write
    process.stdout.write('\r\x1B[K' + line);
  }

  /**
   * Stop the spinner with a final message
   */
  stop(finalMessage?: string): void {
    this.isRunning = false;

    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    const elapsed = Date.now() - this.startTime;

    // Build final line
    let line = '';
    line += simpson.yellow('✓') + ' ';
    line += finalMessage || this.message;

    if (this.options.showTimer) {
      line += simpson.brown(` [${formatTime(elapsed)}]`);
    }

    if (this.options.showTokens && this.tokens.totalTokens > 0) {
      line += simpson.pink(` (${formatTokens(this.tokens.totalTokens)} tokens)`);
    }

    // Clear line, show cursor, print final
    process.stdout.write('\r\x1B[K' + line + '\n');
    process.stdout.write('\x1B[?25h');
  }

  /**
   * Stop with error
   */
  fail(message?: string): void {
    this.isRunning = false;

    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    const elapsed = Date.now() - this.startTime;

    let line = '';
    line += simpson.pink('✗') + ' ';
    line += message || this.message;

    if (this.options.showTimer) {
      line += simpson.brown(` [${formatTime(elapsed)}]`);
    }

    process.stdout.write('\r\x1B[K' + line + '\n');
    process.stdout.write('\x1B[?25h');
  }

  /**
   * Get elapsed time in milliseconds
   */
  getElapsed(): number {
    return Date.now() - this.startTime;
  }

  /**
   * Get current token usage
   */
  getTokens(): TokenUsage {
    return { ...this.tokens };
  }
}

/**
 * Create a shimmer spinner instance
 */
export function createShimmerSpinner(options?: ShimmerSpinnerOptions): ShimmerSpinner {
  return new ShimmerSpinner(options);
}
