import { randomBytes } from 'node:crypto';

export type MemoryType = 'work_log' | 'project_knowledge' | 'decision' | 'strategic_context';

export interface MemoryEntry {
  id: string;
  timestamp: string;
  type: MemoryType;
  content: string;
  tags?: string[];
  relatedIssue?: number;
}

export interface CreateMemoryInput {
  type: MemoryType;
  content: string;
  tags?: string[];
  relatedIssue?: number;
}

function generateId(): string {
  return randomBytes(8).toString('hex');
}

export function createMemoryEntry(input: CreateMemoryInput): MemoryEntry {
  return {
    id: generateId(),
    timestamp: new Date().toISOString(),
    type: input.type,
    content: input.content,
    ...(input.tags && { tags: input.tags }),
    ...(input.relatedIssue !== undefined && { relatedIssue: input.relatedIssue }),
  };
}
