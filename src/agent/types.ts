import type { LanguageModel } from 'ai';

export type ReviewMode = 'manual' | 'auto' | 'merge';
export type DependencyKind = 'explicit' | 'inferred';
export type DependencyConfidence = 'high' | 'medium' | 'low';
export type TaskActionability =
  | 'ready'
  | 'housekeeping'
  | 'waiting_pr'
  | 'blocked_dependency'
  | 'blocked_cycle'
  | 'blocked_out_of_scope';
export type AttemptState = 'never_tried' | 'partial' | 'failure' | 'success' | 'skipped';
export type PriorityTier = 'P0' | 'P1' | 'P2' | 'unlabeled';

export interface DependencyEvidence {
  summary: string;
  codebaseSignals?: string[];
  backlogSignals?: string[];
}

export interface DependencyEdge {
  sourceIssue: number;
  targetIssue: number;
  kind: DependencyKind;
  confidence: DependencyConfidence;
  evidence: DependencyEvidence;
  blocking: boolean;
}

export interface SelectionReason {
  kind:
    | 'priority'
    | 'explicit_dependency'
    | 'inferred_dependency'
    | 'retry'
    | 'existing_work'
    | 'housekeeping'
    | 'blocked'
    | 'tie_break';
  message: string;
  confidence?: DependencyConfidence;
  issueNumber?: number;
}

export interface TaskScoreBreakdown {
  actionability: number;
  retryResume: number;
  priority: number;
  dependencyHint: number;
  existingWork: number;
  issueNumber: number;
  total: number;
}

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
  onOrchestratorEvent?: (event: AgentOrchestratorEvent) => void;
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

export interface FeatureStateSummary {
  recommendation?: string;
  hasExistingBranch?: boolean;
  commitsAhead?: number;
  hasPlan?: boolean;
  hasOpenPr?: boolean;
}

export interface AgentIssueState {
  issueNumber: number;
  title: string;
  labels: string[];
  phase: AgentPhase;
  actionability?: TaskActionability;
  priorityTier?: PriorityTier;
  dependsOn?: number[];
  inferredDependsOn?: Array<{ issueNumber: number; confidence: DependencyConfidence }>;
  blockedBy?: Array<{ issueNumber: number; reason: string; confidence?: DependencyConfidence }>;
  recommendation?: string;
  selectionReasons?: SelectionReason[];
  score?: TaskScoreBreakdown;
  attemptState?: AttemptState;
  featureState?: FeatureStateSummary;
  loopPhase?: string;
  loopFeatureName?: string;
  loopIterations?: number;
  prUrl?: string;
  error?: string;
}

export interface BacklogCandidate extends AgentIssueState {
  body: string;
  createdAt: string;
  explicitDependencyEdges: DependencyEdge[];
  inferredDependencyEdges: DependencyEdge[];
}

export type AgentOrchestratorEvent =
  | {
      type: 'backlog_scanned';
      total: number;
      issues: AgentIssueState[];
    }
  | {
      type: 'candidate_enriched';
      issue: AgentIssueState;
    }
  | {
      type: 'dependencies_inferred';
      issueNumber: number;
      edges: DependencyEdge[];
    }
  | {
      type: 'queue_ranked';
      queue: AgentIssueState[];
    }
  | {
      type: 'task_selected';
      issue: AgentIssueState;
    }
  | {
      type: 'task_blocked';
      issue: AgentIssueState;
    }
  | {
      type: 'task_started';
      issue: AgentIssueState;
    }
  | {
      type: 'task_completed';
      issue: AgentIssueState;
      outcome: 'success' | 'partial' | 'failure' | 'skipped' | 'unknown';
    };
