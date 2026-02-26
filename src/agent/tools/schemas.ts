import { z } from 'zod';

export const FEATURE_NAME_SCHEMA = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/).max(100)
  .describe('Feature name (alphanumeric, hyphens, underscores)');
