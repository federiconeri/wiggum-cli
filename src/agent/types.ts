import type { LanguageModel } from 'ai';

export interface AgentConfig {
  model: LanguageModel;
  projectRoot: string;
  owner: string;
  repo: string;
  maxSteps?: number;
  maxItems?: number;
  labels?: string[];
  dryRun?: boolean;
  onStepUpdate?: (event: AgentStepEvent) => void;
}

export interface AgentStepEvent {
  toolCalls: Array<{ toolName: string; args: unknown }>;
  toolResults: Array<{ toolName: string; result: unknown }>;
  completedItems: number;
}

export interface AgentLogEntry {
  timestamp: string;
  message: string;
  level: 'info' | 'warn' | 'error' | 'success';
}

export type AgentPhase = 'idle' | 'planning' | 'generating_spec' | 'running_loop' | 'reporting' | 'reflecting';

export interface AgentIssueState {
  issueNumber: number;
  title: string;
  labels: string[];
  phase: AgentPhase;
  loopIterations?: number;
  prUrl?: string;
  error?: string;
}
