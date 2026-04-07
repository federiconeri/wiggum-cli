import pc from 'picocolors';

/**
 * Logging utilities with colored output
 */
export const logger = {
  info(message: string): void {
    console.log(pc.blue('info'), message);
  },

  success(message: string): void {
    console.log(pc.green('success'), message);
  },

  warn(message: string): void {
    console.log(pc.yellow('warn'), message);
  },

  error(message: string): void {
    process.stderr.write(`${pc.red('error')} ${message}\n`);
  },

  debug(message: string): void {
    if (process.env.DEBUG) {
      console.log(pc.gray('debug'), message);
    }
  },
};
