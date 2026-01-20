import cfonts from 'cfonts';
import { simpson, drawBox, SIMPSON_COLORS } from './colors.js';

/**
 * Display the WIGGUM CLI ASCII header with welcome box
 */
export function displayHeader(): void {
  // Welcome box like Claude Code
  const welcomeText = '🍩 Welcome to ' + simpson.yellow('Wiggum CLI') + ': AI-powered Ralph development loop CLI 🍩';
  console.log('');
  console.log(drawBox(welcomeText, 2));
  console.log('');

  // ASCII art logo in Simpson yellow
  cfonts.say('WIGGUM CLI', {
    font: 'block',
    colors: [SIMPSON_COLORS.yellow],
    letterSpacing: 1,
    lineHeight: 1,
    space: false,
    maxLength: 0,
  });
}

/**
 * Display a minimal header (for subcommands)
 */
export function displayMinimalHeader(): void {
  console.log('');
  console.log(simpson.yellow('Wiggum CLI') + simpson.brown(' │ ') + 'AI-powered Ralph development loop');
  console.log('');
}
