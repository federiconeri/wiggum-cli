import type { LanguageModel } from 'ai';

export type ReviewMode = 'manual' | 'auto' | 'merge';

export interface AgentConfig {
  model: LanguageModel;
  modelId?: string;
  provider?: string;
  projectRoot: string;
  owner: string;
  repo: string;
  maxSteps?: number;
  maxItems?: number;
  labels?: string[];
  issues?: number[];
  reviewMode?: ReviewMode;
  dryRun?: boolean;
  onStepUpdate?: (event: AgentStepEvent) => void;
  onProgress?: (toolName: string, line: string) => void;
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
  loopPhase?: string;
  loopFeatureName?: string;
  loopIterations?: number;
  prUrl?: string;
  error?: string;
}
