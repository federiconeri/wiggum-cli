import cfonts from 'cfonts';
import { simpson, drawBox, SIMPSON_COLORS } from './colors.js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Get version from package.json
function getVersion(): string {
  try {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    const packagePath = join(__dirname, '..', '..', 'package.json');
    const pkg = JSON.parse(readFileSync(packagePath, 'utf-8'));
    return pkg.version || '0.5.0';
  } catch {
    return '0.5.0';
  }
}

/**
 * Display the WIGGUM CLI ASCII header with welcome box
 */
export function displayHeader(): void {
  const version = getVersion();
  // Welcome box like Claude Code with version
  const welcomeText = '🍩 Welcome to Wiggum CLI: AI-powered ' + simpson.yellow('Ralph') + ' development loop CLI 🍩 ' + simpson.pink(`v${version}`);
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
