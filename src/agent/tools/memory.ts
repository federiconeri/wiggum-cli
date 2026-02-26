import { tool, zodSchema } from 'ai';
import { z } from 'zod';
import type { MemoryStore } from '../memory/store.js';
import { createMemoryEntry } from '../memory/types.js';
import {
  listStrategicDocs,
  readStrategicDoc,
} from '../memory/ingest.js';

export const REFLECT_TOOL_NAME = 'reflectOnWork';

export function createMemoryTools(store: MemoryStore, projectRoot?: string) {
  const readMemory = tool({
    description: 'Read recent memory entries. Use before planning to recall past outcomes and decisions.',
    inputSchema: zodSchema(z.object({
      type: z.enum(['work_log', 'project_knowledge', 'decision', 'strategic_context']).optional()
        .describe('Filter by memory type'),
      limit: z.number().int().min(1).max(50).default(10).describe('Max entries to return'),
      search: z.string().optional().describe('Search term to filter by content'),
    })),
    execute: async ({ type, limit, search }) => {
      const entries = await store.read({ type, limit, search });
      return { entries };
    },
  });

  const writeMemory = tool({
    description: 'Write a memory entry. Use after completing work or learning something important.',
    inputSchema: zodSchema(z.object({
      type: z.enum(['work_log', 'project_knowledge', 'decision']).describe('Type of memory'),
      content: z.string().describe('The memory content — be specific and narrative'),
      tags: z.array(z.string()).optional().describe('Tags for filtering (e.g., auth, api)'),
      relatedIssue: z.number().int().optional().describe('Related GitHub issue number'),
    })),
    execute: async ({ type, content, tags, relatedIssue }) => {
      const entry = createMemoryEntry({ type, content, tags, relatedIssue });
      await store.append(entry);
      return { id: entry.id, timestamp: entry.timestamp };
    },
  });

  const reflectOnWork = tool({
    description: 'Reflect on completed work to extract learnings and patterns. Call after each issue.',
    inputSchema: zodSchema(z.object({
      issueNumber: z.number().int().describe('The issue that was worked on'),
      outcome: z.enum(['success', 'partial', 'failure']).describe('How did it go?'),
      whatWorked: z.string().describe('What went well'),
      whatFailed: z.string().describe('What went wrong or was difficult'),
      patternDiscovered: z.string().optional().describe('Any reusable pattern discovered'),
      specQualityNote: z.string().optional().describe('How could the spec have been better?'),
    })),
    execute: async ({ issueNumber, outcome, whatWorked, whatFailed, patternDiscovered, specQualityNote }) => {
      const entries = [];

      entries.push(createMemoryEntry({
        type: 'work_log',
        content: `Issue #${issueNumber} (${outcome}). Worked: ${whatWorked}. Failed: ${whatFailed}`,
        relatedIssue: issueNumber,
        tags: [outcome],
      }));

      if (patternDiscovered) {
        entries.push(createMemoryEntry({
          type: 'project_knowledge',
          content: patternDiscovered,
          relatedIssue: issueNumber,
          tags: ['pattern'],
        }));
      }

      if (specQualityNote) {
        entries.push(createMemoryEntry({
          type: 'project_knowledge',
          content: `Spec quality (#${issueNumber}): ${specQualityNote}`,
          relatedIssue: issueNumber,
          tags: ['spec-quality'],
        }));
      }

      for (const entry of entries) {
        await store.append(entry);
      }

      return { memoriesWritten: entries.length };
    },
  });

  const listStrategicDocsT = tool({
    description: 'List available strategic documents in .ralph/strategic/. Returns filenames. Use readStrategicDoc to read full content.',
    inputSchema: zodSchema(z.object({})),
    execute: async () => {
      if (!projectRoot) return { files: [] };
      const files = await listStrategicDocs(projectRoot);
      return { files };
    },
  });

  const readStrategicDocT = tool({
    description: 'Read the full content of a strategic document. Use to get detailed architecture, design, or implementation plans relevant to the current task.',
    inputSchema: zodSchema(z.object({
      filename: z.string().describe('Filename to read (e.g. "design.md")'),
    })),
    execute: async ({ filename }) => {
      if (!projectRoot) return { error: 'No project root configured' };
      const content = await readStrategicDoc(projectRoot, filename);
      if (content === null) return { error: `File not found: ${filename}` };
      return { filename, content };
    },
  });

  return { readMemory, writeMemory, reflectOnWork, listStrategicDocs: listStrategicDocsT, readStrategicDoc: readStrategicDocT };
}
