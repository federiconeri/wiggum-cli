import cfonts from 'cfonts';

/**
 * Display the RALPH ASCII header in Simpson yellow
 */
export function displayHeader(): void {
  cfonts.say('RALPH', {
    font: 'block',
    colors: ['#FED90F'],
    letterSpacing: 1,
    lineHeight: 1,
    space: true,
    maxLength: 0,
  });
}
