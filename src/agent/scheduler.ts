import { z } from 'zod';
import type { MemoryEntry } from './memory/types.js';
import type { MemoryStore } from './memory/store.js';
import type {
  AgentConfig,
  AgentIssueState,
  AgentOrchestratorEvent,
  AttemptState,
  BacklogCandidate,
  DependencyConfidence,
  DependencyEdge,
  PriorityTier,
  SelectionReason,
  ScopeExpansion,
  TaskActionability,
  TaskScoreBreakdown,
} from './types.js';
import { listRepoIssues, fetchGitHubIssue, type GitHubIssueDetail, type GitHubIssueListItem, type ListIssuesResult } from '../utils/github.js';
import { assessFeatureStateImpl, type FeatureState } from './tools/feature-state.js';
import { getTracedAI } from '../utils/tracing.js';
import { loadContext } from '../context/index.js';
import { isReasoningModel } from '../ai/providers.js';

const DEPENDENCY_PATTERN = /\b(?:depends on|blocked by|requires|after)\s+#(\d+)/gi;
const STOP_WORDS = new Set([
  'the', 'and', 'for', 'with', 'from', 'into', 'that', 'this', 'have', 'has', 'will', 'would',
  'should', 'about', 'issue', 'task', 'feature', 'support', 'implement', 'add', 'build', 'create',
  'update', 'fix', 'make', 'allow', 'user', 'users', 'cli', 'agent', 'part', 'related', 'summary',
]);
const GENERIC_DEPENDENCY_TOKENS = new Set([
  'protocol',
  'runtime',
  'modal',
  'status',
  'contract',
  'interface',
  'implementation',
  'bridge',
  'workflow',
  'execution',
]);
const DEPENDENCY_CUE_PATTERN = /\b(depends on|blocked by|requires|after)\b/i;
const MAX_MODEL_INFERENCE_CANDIDATES = 12;
const ENRICHMENT_CONCURRENCY = 6;
const INFERENCE_CONCURRENCY = 3;
const BACKLOG_DISCOVERY_STEP = 100;
const BACKLOG_DISCOVERY_MAX_LIMIT = 5000;

const inferredDependencySchema = z.object({
  edges: z.array(z.object({
    targetIssue: z.number().int().positive(),
    confidence: z.enum(['high', 'medium', 'low']),
    evidence: z.string().min(1),
  })).default([]),
});

export interface RankedBacklog {
  queue: BacklogCandidate[];
  actionable: BacklogCandidate[];
  blocked: BacklogCandidate[];
  expansions: ScopeExpansion[];
  errors: string[];
}

export interface SchedulerRunCache {
  listed?: ListIssuesResult;
  listedUnfiltered?: ListIssuesResult;
  issueDetails: Map<number, GitHubIssueDetail | null>;
  featureStates: Map<number, FeatureState>;
  persistedContext?: Awaited<ReturnType<typeof loadContext>> | null;
}

export function createSchedulerRunCache(): SchedulerRunCache {
  return {
    listed: undefined,
    listedUnfiltered: undefined,
    issueDetails: new Map<number, GitHubIssueDetail | null>(),
    featureStates: new Map<number, FeatureState>(),
    persistedContext: undefined,
  };
}

export function invalidateSchedulerRunCache(
  cache: SchedulerRunCache,
  issueNumbers: number[] = [],
): void {
  cache.listed = undefined;
  cache.listedUnfiltered = undefined;
  for (const issueNumber of issueNumbers) {
    cache.issueDetails.delete(issueNumber);
    cache.featureStates.delete(issueNumber);
  }
}

function emitBacklogEvent(config: AgentConfig, event: AgentOrchestratorEvent): void {
  config.onOrchestratorEvent?.(event);
}

function nowMs(): number {
  return Date.now();
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) return [];
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  const worker = async () => {
    while (true) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      if (currentIndex >= items.length) return;
      results[currentIndex] = await mapper(items[currentIndex], currentIndex);
    }
  };

  const workerCount = Math.min(concurrency, items.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}

async function getIssueDetail(
  config: AgentConfig,
  issueNumber: number,
  cache?: SchedulerRunCache,
): Promise<GitHubIssueDetail | null> {
  if (cache?.issueDetails.has(issueNumber)) {
    return cache.issueDetails.get(issueNumber) ?? null;
  }

  const detail = await fetchGitHubIssue(config.owner, config.repo, issueNumber);
  cache?.issueDetails.set(issueNumber, detail);
  return detail;
}

async function getFeatureState(
  config: AgentConfig,
  issueNumber: number,
  featureName: string,
  cache?: SchedulerRunCache,
): Promise<FeatureState> {
  const cached = cache?.featureStates.get(issueNumber);
  if (cached) return cached;

  const featureState = await assessFeatureStateImpl(config.projectRoot, featureName, issueNumber);
  cache?.featureStates.set(issueNumber, featureState);
  return featureState;
}

async function getPersistedContext(
  config: AgentConfig,
  cache?: SchedulerRunCache,
): Promise<Awaited<ReturnType<typeof loadContext>> | null> {
  if (cache && cache.persistedContext !== undefined) {
    return cache.persistedContext;
  }

  const persistedContext = await loadContext(config.projectRoot).catch(() => null);
  if (cache) {
    cache.persistedContext = persistedContext;
  }
  return persistedContext;
}

async function discoverListedIssues(
  config: AgentConfig,
  search?: string,
  cache?: SchedulerRunCache,
  cacheKey: 'listed' | 'listedUnfiltered' = 'listed',
): Promise<ListIssuesResult> {
  const cached = cache?.[cacheKey];
  if (cached) return cached;

  let requestedLimit = BACKLOG_DISCOVERY_STEP;
  let latest: ListIssuesResult = { issues: [] };

  while (true) {
    latest = await listRepoIssues(config.owner, config.repo, search, requestedLimit);
    if (latest.error) break;
    if (latest.issues.length < requestedLimit || requestedLimit >= BACKLOG_DISCOVERY_MAX_LIMIT) break;
    requestedLimit += BACKLOG_DISCOVERY_STEP;
  }

  if (cache) {
    cache[cacheKey] = latest;
  }
  return latest;
}

async function resolveOpenDependencies(
  config: AgentConfig,
  dependencies: number[],
  listedIssues: GitHubIssueListItem[],
  cache?: SchedulerRunCache,
): Promise<number[]> {
  const listedOpen = new Set(listedIssues.map(issue => issue.number));
  const openDependencies: number[] = [];

  for (const dependencyNumber of dependencies) {
    if (listedOpen.has(dependencyNumber)) {
      openDependencies.push(dependencyNumber);
      continue;
    }

    const dependencyDetail = await getIssueDetail(config, dependencyNumber, cache);
    if (dependencyDetail?.state === 'open') {
      openDependencies.push(dependencyNumber);
    }
  }

  return openDependencies;
}

export function extractDependencyHints(
  body: string,
  backlogIssues: Array<{ number: number; title: string }> = [],
  currentIssueNumber?: number,
): number[] {
  const matches = [...body.matchAll(DEPENDENCY_PATTERN)];
  const numbers = matches.map(m => parseInt(m[1], 10));
  const inferredFromTitles: number[] = [];

  const cueMatches = [...body.matchAll(/\b(?:depends on|blocked by|requires|after)\b([^\n.;]*)/gi)];
  for (const cueMatch of cueMatches) {
    const phrase = cueMatch[1]?.trim() ?? '';
    const segments = phrase
      .split(/\s+\+\s+|\s+and\s+|,/i)
      .map(segment => segment.trim())
      .filter(Boolean);

    for (const segment of segments) {
      const segmentTokens = normalizeTokens(segment);
      if (segmentTokens.length === 0) continue;
      const allowSingleTokenFallback = segmentTokens.length === 1
        && segmentTokens[0].length >= 6
        && !GENERIC_DEPENDENCY_TOKENS.has(segmentTokens[0]);

      const scored = backlogIssues
        .filter(issue => issue.number !== currentIssueNumber)
        .map(issue => {
          const titleTokens = normalizeTokens(issue.title);
          const overlap = titleTokens.filter(token => segmentTokens.includes(token)).length;
          const uniqueTokenMatch = allowSingleTokenFallback && titleTokens.includes(segmentTokens[0]);
          return { issue, overlap, uniqueTokenMatch };
        })
        .filter(item => item.overlap > 0 || item.uniqueTokenMatch);

      if (scored.length === 0) continue;

      const bestOverlap = Math.max(...scored.map(item => item.overlap));
      for (const item of scored) {
        if (bestOverlap >= 2) {
          if (item.overlap === bestOverlap) {
            inferredFromTitles.push(item.issue.number);
          }
        }
      }

      if (bestOverlap < 2 && allowSingleTokenFallback) {
        const exactTokenMatches = scored.filter(item => item.uniqueTokenMatch);
        if (exactTokenMatches.length === 1) {
          inferredFromTitles.push(exactTokenMatches[0].issue.number);
        }
      }
    }
  }

  return [...new Set([...numbers, ...inferredFromTitles])].sort((a, b) => a - b);
}

export function deriveFeatureNameFromTitle(title: string): string {
  const words = title
    .toLowerCase()
    .replace(/#[0-9]+/g, ' ')
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .filter(word => !STOP_WORDS.has(word))
    .slice(0, 4);

  return (words.length > 0 ? words : ['feature']).join('-');
}

function derivePriorityTier(labels: string[]): PriorityTier {
  if (labels.includes('P0')) return 'P0';
  if (labels.includes('P1')) return 'P1';
  if (labels.includes('P2')) return 'P2';
  return 'unlabeled';
}

function priorityWeight(tier: PriorityTier): number {
  switch (tier) {
    case 'P0': return 300;
    case 'P1': return 200;
    case 'P2': return 100;
    default: return 0;
  }
}

function attemptWeight(attemptState: AttemptState, recommendation?: string): number {
  const retryBase = attemptState === 'failure' || attemptState === 'partial' ? 200 : 0;
  const resumeBase = recommendation === 'resume_implementation' || recommendation === 'resume_pr_phase'
    ? 160
    : recommendation === 'generate_plan'
      ? 80
      : 0;
  return retryBase + resumeBase;
}

function actionabilityWeight(actionability: TaskActionability): number {
  switch (actionability) {
    case 'housekeeping': return 1000;
    case 'ready': return 800;
    case 'waiting_pr': return 0;
    case 'blocked_dependency': return 0;
    case 'blocked_cycle': return 0;
    case 'blocked_out_of_scope': return 0;
    default: return 0;
  }
}

function existingWorkWeight(candidate: Pick<BacklogCandidate, 'featureState'>): number {
  const state = candidate.featureState;
  if (!state) return 0;
  let weight = 0;
  if (state.hasExistingBranch) weight += 75;
  if (state.hasPlan) weight += 75;
  if ((state.commitsAhead ?? 0) > 0) weight += 75;
  return weight;
}

function issueNumberWeight(issueNumber: number): number {
  return Math.max(0, 1000 - issueNumber);
}

function getAttemptState(memories: MemoryEntry[], issueNumber: number): AttemptState {
  const entry = memories.find((item) => item.relatedIssue === issueNumber);
  if (!entry) return 'never_tried';
  const tags = new Set(entry.tags ?? []);
  if (tags.has('failure')) return 'failure';
  if (tags.has('partial')) return 'partial';
  if (tags.has('success')) return 'success';
  if (tags.has('skipped')) return 'skipped';
  return 'never_tried';
}

function buildCodebaseContext(persisted: Awaited<ReturnType<typeof loadContext>>): string {
  if (!persisted?.aiAnalysis) return 'No persisted codebase context available.';
  const projectContext = persisted.aiAnalysis.projectContext;
  const lines: string[] = [];
  if (projectContext?.entryPoints?.length) {
    lines.push(`Entry points: ${projectContext.entryPoints.join(', ')}`);
  }
  if (projectContext?.keyDirectories && Object.keys(projectContext.keyDirectories).length > 0) {
    lines.push(`Key directories: ${Object.entries(projectContext.keyDirectories).map(([key, value]) => `${key} (${value})`).join(', ')}`);
  }
  if (persisted.aiAnalysis.implementationGuidelines?.length) {
    lines.push(`Implementation guidelines: ${persisted.aiAnalysis.implementationGuidelines.slice(0, 8).join('; ')}`);
  }
  if (persisted.aiAnalysis.technologyPractices?.practices?.length) {
    lines.push(`Technology practices: ${persisted.aiAnalysis.technologyPractices.practices.slice(0, 8).join('; ')}`);
  }
  return lines.length > 0 ? lines.join('\n') : 'No persisted codebase context available.';
}

function normalizeTokens(text: string): string[] {
  return text
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .replace(/#[0-9]+/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .filter(word => word.length > 2 && !STOP_WORDS.has(word));
}

function tokenOverlap(a: string, b: string): number {
  const left = new Set(normalizeTokens(a));
  const right = new Set(normalizeTokens(b));
  if (left.size === 0 || right.size === 0) return 0;
  let overlap = 0;
  for (const token of left) {
    if (right.has(token)) overlap += 1;
  }
  return overlap;
}

function sharedSignals(issueText: string, peerText: string): string[] {
  const issueTokens = new Set(normalizeTokens(issueText));
  const peerTokens = new Set(normalizeTokens(peerText));
  const signals = [...issueTokens]
    .filter(token => peerTokens.has(token))
    .filter(token => token.length >= 5)
    .slice(0, 3);
  return signals;
}

function peerHasRuntimeFoundation(peerText: string): boolean {
  return /\b(runtime|contract|interface|protocol)\b/i.test(peerText);
}

function peerHasApiFoundation(peerText: string): boolean {
  return /\b(schema|api|backend|storage|infrastructure|foundation|setup|config)\b/i.test(peerText);
}

function issueLooksLikeConsumerWork(issueText: string): boolean {
  return /\b(ui|screen|render|surface|workflow|integration|consume|page|command)\b/i.test(issueText);
}

function issueHasPrerequisiteLanguage(issueText: string): boolean {
  return /\b(after|once|using|reuse|extend|build on|depends on|blocked by|requires)\b/i.test(issueText);
}

function peerIsAncillary(peerText: string): boolean {
  return /\b(debug|logging|logger|observability|instrumentation|tracking|breadcrumb|sentry|telemetry|diagnos|monitoring)\b/i.test(peerText);
}

function peerDeclaresOrdering(peerText: string): boolean {
  return /\b(protocol-first|foundation-first|should land before|must land before|before ui|before integration|prerequisite|groundwork)\b/i.test(peerText);
}

function qualifiesForHardInferredBlock(
  issue: BacklogCandidate,
  peer: BacklogCandidate,
  overlap: number,
): boolean {
  if (peer.issueNumber >= issue.issueNumber) return false;

  const issueText = `${issue.title}\n${issue.body}`;
  const peerText = `${peer.title}\n${peer.body}`;
  if (peerIsAncillary(peerText)) return false;

  const runtimeFoundation = peerHasRuntimeFoundation(peerText);
  const apiFoundation = peerHasApiFoundation(peerText);
  const foundational = runtimeFoundation || apiFoundation || peerLooksFoundational(peer) || peerDeclaresOrdering(peerText);
  if (!foundational || overlap < 2) return false;

  const evalWork = /\b(eval|evaluation|benchmark|baseline|metric|report|harness)\b/i.test(issueText);
  const rolloutWork = /\b(rollout|rollback|flag|fallback|kill switch|control)\b/i.test(issueText);
  const hybridWork = /\b(hybrid|handoff|routing|phase)\b/i.test(issueText);
  const issueNeedsFoundation = issueLooksLikeConsumerWork(issueText) || issueHasPrerequisiteLanguage(issueText) || evalWork || rolloutWork || hybridWork;

  return issueNeedsFoundation;
}

function normalizeInferredEdge(
  issue: BacklogCandidate,
  peer: BacklogCandidate,
  edge: DependencyEdge,
): DependencyEdge {
  const issueText = `${issue.title}\n${issue.body}`;
  const peerText = `${peer.title}\n${peer.body}`;
  const overlap = tokenOverlap(issueText, peerText);
  const canHardBlock = qualifiesForHardInferredBlock(issue, peer, overlap);
  if (edge.confidence === 'high' && !canHardBlock) {
    return {
      ...edge,
      confidence: 'medium',
      blocking: false,
    };
  }

  return {
    ...edge,
    blocking: edge.confidence === 'high' && canHardBlock,
  };
}

function describeFallbackDependency(
  issue: BacklogCandidate,
  peer: BacklogCandidate,
  shared: string[],
): string {
  const issueText = `${issue.title}\n${issue.body}`;
  const peerText = `${peer.title}\n${peer.body}`;

  const runtimeFoundation = peerHasRuntimeFoundation(peerText);
  const evalWork = /\b(eval|evaluation|benchmark|baseline|metric|report|harness)\b/i.test(issueText);
  const rolloutWork = /\b(rollout|rollback|flag|fallback|kill switch|control)\b/i.test(issueText);
  const hybridWork = /\b(hybrid|handoff|routing|phase)\b/i.test(issueText);
  const consumerWork = issueLooksLikeConsumerWork(issueText);
  const apiFoundation = peerHasApiFoundation(peerText);

  if (runtimeFoundation && evalWork) {
    return `#${peer.issueNumber} defines the native runtime contract that this evaluation work should measure against first.`;
  }
  if (runtimeFoundation && rolloutWork) {
    return `#${peer.issueNumber} establishes the native runtime foundation that this rollout work depends on.`;
  }
  if (runtimeFoundation && hybridWork) {
    return `#${peer.issueNumber} defines the runtime contract that this hybrid execution work builds on.`;
  }
  if (runtimeFoundation) {
    return `#${peer.issueNumber} defines the runtime contract that this issue likely needs first.`;
  }
  if (apiFoundation && consumerWork) {
    return `#${peer.issueNumber} provides the foundational API or infrastructure that this issue consumes.`;
  }
  if (shared.length > 0) {
    return `#${peer.issueNumber} appears to be the more foundational issue in the same subsystem (${shared.join(', ')}).`;
  }
  return `#${peer.issueNumber} appears to be the more foundational issue that this work builds on.`;
}

function buildFallbackInferredEdges(issue: BacklogCandidate, peers: BacklogCandidate[]): DependencyEdge[] {
  const edges: DependencyEdge[] = [];
  const issueText = `${issue.title}\n${issue.body}`;
  for (const peer of peers) {
    if (peer.issueNumber === issue.issueNumber) continue;
    const peerText = `${peer.title}\n${peer.body}`;
    const overlap = tokenOverlap(issueText, peerText);
    if (overlap === 0) continue;

    const peerFoundation = /\b(core|base|foundation|scaffold|setup|config|schema|api|storage|data|backend|infrastructure)\b/i.test(peerText);
    const issueConsumer = issueLooksLikeConsumerWork(issueText);
    const issuePrereqLanguage = issueHasPrerequisiteLanguage(issueText);
    const runtimeFoundation = peerHasRuntimeFoundation(peerText);
    const blocking = peer.issueNumber < issue.issueNumber && (peerFoundation || runtimeFoundation || issuePrereqLanguage) && overlap >= 1;
    if (!blocking) continue;

    const confidence: DependencyConfidence = ((peerFoundation || runtimeFoundation) && (issueConsumer || issuePrereqLanguage) && overlap >= 2) ? 'high' : 'medium';
    const shared = sharedSignals(issueText, peerText);
    edges.push(normalizeInferredEdge(issue, peer, {
      sourceIssue: issue.issueNumber,
      targetIssue: peer.issueNumber,
      kind: 'inferred',
      confidence,
      blocking: confidence === 'high',
      evidence: {
        summary: describeFallbackDependency(issue, peer, shared),
        backlogSignals: [`Issue #${peer.issueNumber} appears more foundational and lower-numbered.`],
      },
    }));
  }
  return edges;
}

async function inferDependenciesWithModel(
  config: AgentConfig,
  issue: BacklogCandidate,
  peers: BacklogCandidate[],
  codebaseContext: string,
): Promise<DependencyEdge[]> {
  if (!config.modelId || peers.length === 0) return [];

  const { generateObject } = getTracedAI();
  const peerSummary = peers.map((peer) => (
    `#${peer.issueNumber}: ${peer.title}\nLabels: ${peer.labels.join(', ') || 'none'}\nBody: ${peer.body.slice(0, 400)}`
  )).join('\n\n');

  try {
    const { object } = await generateObject({
      model: config.model,
      schema: inferredDependencySchema,
      system: `You infer issue dependencies conservatively for a backlog orchestrator.

Rules:
- Only return a dependency if the current issue truly needs another issue to be completed first.
- Favor infra-before-feature, schema/API-before-consumer, and groundwork-before-integration patterns.
- Use backlog and codebase context as evidence.
- Do not return duplicates or speculative edges.`,
      prompt: `Codebase context:\n${codebaseContext}

Current issue:
#${issue.issueNumber}: ${issue.title}
Labels: ${issue.labels.join(', ') || 'none'}
Body:
${issue.body.slice(0, 1200)}

Candidate prerequisite issues:
${peerSummary}

Return only the issues that must or likely should come first.`,
      ...(isReasoningModel(config.modelId) ? {} : { temperature: 0.1 }),
      experimental_telemetry: {
        isEnabled: true,
        metadata: {
          agent: 'agent-dependency-inference',
          issueNumber: String(issue.issueNumber),
        },
      },
    });

    return object.edges
      .filter(edge => peers.some(peer => peer.issueNumber === edge.targetIssue))
      .map((edge) => {
        const peer = peers.find(candidate => candidate.issueNumber === edge.targetIssue);
        if (!peer) return null;
        return normalizeInferredEdge(issue, peer, {
          sourceIssue: issue.issueNumber,
          targetIssue: edge.targetIssue,
          kind: 'inferred' as const,
          confidence: edge.confidence,
          blocking: edge.confidence === 'high',
          evidence: {
            summary: edge.evidence,
            codebaseSignals: codebaseContext !== 'No persisted codebase context available.'
              ? ['Persisted project context was used during dependency inference.']
              : undefined,
          },
        });
      })
      .filter((edge): edge is DependencyEdge => edge != null);
  } catch {
    return [];
  }
}

async function inferDependencyEdges(
  config: AgentConfig,
  issue: BacklogCandidate,
  backlog: BacklogCandidate[],
  codebaseContext: string,
): Promise<DependencyEdge[]> {
  const peers = backlog
    .filter(peer => peer.issueNumber !== issue.issueNumber)
    .map(peer => ({ peer, overlap: tokenOverlap(`${issue.title}\n${issue.body}`, `${peer.title}\n${peer.body}`) }))
    .filter(item => item.overlap > 0 || peerLooksFoundational(item.peer))
    .sort((a, b) => {
      if (b.overlap !== a.overlap) return b.overlap - a.overlap;
      return a.peer.issueNumber - b.peer.issueNumber;
    })
    .slice(0, 6)
    .map(item => item.peer);

  const modelEdges = await inferDependenciesWithModel(config, issue, peers, codebaseContext);
  if (modelEdges.length > 0) return dedupeEdges([...buildFallbackInferredEdges(issue, peers), ...modelEdges]);
  return dedupeEdges(buildFallbackInferredEdges(issue, peers));
}

function peerLooksFoundational(peer: BacklogCandidate): boolean {
  return /\b(core|base|foundation|setup|scaffold|schema|api|config|storage|backend|infrastructure)\b/i.test(`${peer.title}\n${peer.body}`);
}

export function dedupeEdges(edges: DependencyEdge[]): DependencyEdge[] {
  const deduped = new Map<string, DependencyEdge>();
  const confidenceWeight = { low: 1, medium: 2, high: 3 } as const;

  for (const edge of edges) {
    const key = `${edge.sourceIssue}:${edge.targetIssue}:${edge.kind}`;
    const existing = deduped.get(key);
    if (!existing) {
      deduped.set(key, edge);
      continue;
    }

    const existingScore = confidenceWeight[existing.confidence] + (existing.blocking ? 10 : 0);
    const nextScore = confidenceWeight[edge.confidence] + (edge.blocking ? 10 : 0);
    if (nextScore >= existingScore) {
      deduped.set(key, edge);
    }
  }

  return [...deduped.values()];
}

function detectCycleForIssue(
  issueNumber: number,
  adjacency: Map<number, number[]>,
  visiting: Set<number>,
  visited: Set<number>,
): boolean {
  if (visiting.has(issueNumber)) return true;
  if (visited.has(issueNumber)) return false;
  visiting.add(issueNumber);
  const next = adjacency.get(issueNumber) ?? [];
  for (const dependency of next) {
    if (detectCycleForIssue(dependency, adjacency, visiting, visited)) return true;
  }
  visiting.delete(issueNumber);
  visited.add(issueNumber);
  return false;
}

function buildSelectionReasons(candidate: BacklogCandidate): SelectionReason[] {
  const reasons: SelectionReason[] = [];
  if (candidate.scopeOrigin === 'dependency' && candidate.requestedBy?.length) {
    reasons.push({
      kind: 'scope_expansion',
      message: `Pulled into scope as a prerequisite for ${candidate.requestedBy.map(issueNumber => `#${issueNumber}`).join(', ')}.`,
    });
  }
  if (candidate.actionability === 'housekeeping') {
    reasons.push({ kind: 'housekeeping', message: 'Issue appears already shipped and only needs housekeeping.' });
  }
  if (candidate.attemptState === 'failure' || candidate.attemptState === 'partial') {
    reasons.push({ kind: 'retry', message: `Previous outcome was ${candidate.attemptState}; resume is preferred over starting new work.` });
  }
  if (candidate.priorityTier && candidate.priorityTier !== 'unlabeled') {
    reasons.push({ kind: 'priority', message: `PM priority ${candidate.priorityTier}.` });
  }
  if ((candidate.featureState?.hasExistingBranch ?? false) || (candidate.featureState?.hasPlan ?? false)) {
    reasons.push({ kind: 'existing_work', message: 'Existing branch or plan work makes this item cheaper to continue.' });
  }
  for (const edge of candidate.explicitDependencyEdges) {
    reasons.push({
      kind: 'explicit_dependency',
      message: `Explicitly depends on #${edge.targetIssue}.`,
      issueNumber: edge.targetIssue,
      confidence: edge.confidence,
    });
  }
  for (const edge of candidate.inferredDependencyEdges) {
    reasons.push({
      kind: 'inferred_dependency',
      message: edge.evidence.summary,
      issueNumber: edge.targetIssue,
      confidence: edge.confidence,
    });
  }
  for (const blocked of candidate.blockedBy ?? []) {
    reasons.push({
      kind: 'blocked',
      message: blocked.reason,
      issueNumber: blocked.issueNumber,
      confidence: blocked.confidence,
    });
  }
  return reasons;
}

function buildScore(candidate: BacklogCandidate): TaskScoreBreakdown {
  const actionability = actionabilityWeight(candidate.actionability ?? 'blocked_dependency');
  const retryResume = attemptWeight(candidate.attemptState ?? 'never_tried', candidate.recommendation);
  const priority = priorityWeight(candidate.priorityTier ?? 'unlabeled');
  const dependencyHint = -50 * candidate.inferredDependencyEdges.filter(edge => edge.confidence === 'medium').length;
  const existingWork = existingWorkWeight(candidate);
  const issueNumber = issueNumberWeight(candidate.issueNumber);
  return {
    actionability,
    retryResume,
    priority,
    dependencyHint,
    existingWork,
    issueNumber,
    total: actionability + retryResume + priority + dependencyHint + existingWork + issueNumber,
  };
}

function evaluateActionability(
  candidate: BacklogCandidate,
  enforcedDependencyMap: Map<number, DependencyEdge[]>,
  issueScope?: Set<number>,
): TaskActionability {
  const recommendation = candidate.recommendation;
  if (recommendation === 'pr_exists_open' || recommendation === 'linked_pr_open') {
    return 'waiting_pr';
  }
  if (recommendation === 'pr_merged' || recommendation === 'linked_pr_merged') {
    return 'housekeeping';
  }

  const blockers: Array<{ issueNumber: number; reason: string; confidence?: DependencyConfidence }> = [];
  const dependencies = enforcedDependencyMap.get(candidate.issueNumber) ?? [];
  for (const edge of dependencies) {
    if (issueScope && !issueScope.has(edge.targetIssue)) {
      blockers.push({
        issueNumber: edge.targetIssue,
        reason: `Depends on out-of-scope issue #${edge.targetIssue}.`,
        confidence: edge.confidence,
      });
      continue;
    }
    blockers.push({
      issueNumber: edge.targetIssue,
      reason: `${edge.kind === 'explicit' ? 'Explicit' : 'Inferred'} dependency on #${edge.targetIssue}.`,
      confidence: edge.confidence,
    });
  }

  candidate.blockedBy = blockers;
  if (blockers.some(blocker => blocker.reason.includes('out-of-scope'))) {
    return 'blocked_out_of_scope';
  }
  if (blockers.length > 0) {
    return 'blocked_dependency';
  }
  return 'ready';
}

function toIssueState(candidate: BacklogCandidate): AgentIssueState {
  return {
    issueNumber: candidate.issueNumber,
    title: candidate.title,
    labels: candidate.labels,
    phase: candidate.phase,
    scopeOrigin: candidate.scopeOrigin,
    requestedBy: candidate.requestedBy,
    actionability: candidate.actionability,
    priorityTier: candidate.priorityTier,
    dependsOn: candidate.dependsOn,
    inferredDependsOn: candidate.inferredDependsOn,
    blockedBy: candidate.blockedBy,
    recommendation: candidate.recommendation,
    selectionReasons: candidate.selectionReasons,
    score: candidate.score,
    attemptState: candidate.attemptState,
    featureState: candidate.featureState,
    loopFeatureName: candidate.loopFeatureName,
  };
}

async function expandIssueScope(
  config: AgentConfig,
  listedIssues: Array<{ number: number; title: string; labels: string[]; createdAt: string }>,
  cache?: SchedulerRunCache,
): Promise<{ effectiveScope: Set<number> | undefined; expansions: ScopeExpansion[]; errors: string[] }> {
  if (!config.issues?.length) {
    return { effectiveScope: undefined, expansions: [], errors: [] };
  }

  const effectiveScope = new Set(config.issues);
  const expansions: ScopeExpansion[] = [];
  const errors: string[] = [];
  const backlogSummaries = listedIssues.map(issue => ({ number: issue.number, title: issue.title }));
  for (const issueNumber of config.issues) {
    if (backlogSummaries.some(issue => issue.number === issueNumber)) continue;
    const detail = await getIssueDetail(config, issueNumber, cache);
    if (detail?.state === 'open') {
      backlogSummaries.push({ number: detail.number, title: detail.title });
    }
  }
  const queue: Array<{ issueNumber: number; requestedBy: number }> = config.issues.map(issueNumber => ({
    issueNumber,
    requestedBy: issueNumber,
  }));

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) continue;

    const detail = await getIssueDetail(config, current.issueNumber, cache);
    if (!detail) {
      errors.push(`Failed to fetch issue #${current.issueNumber} from GitHub while expanding dependencies. Check gh connectivity.`);
      continue;
    }

    const dependencyNumbers = extractDependencyHints(detail.body ?? '', backlogSummaries, current.issueNumber);
    for (const dependencyNumber of dependencyNumbers) {
      if (effectiveScope.has(dependencyNumber)) continue;

      if (!backlogSummaries.some(issue => issue.number === dependencyNumber)) {
        const dependencyDetail = await getIssueDetail(config, dependencyNumber, cache);
        if (!dependencyDetail) {
          errors.push(`Failed to fetch dependency issue #${dependencyNumber} from GitHub. Check gh connectivity.`);
          continue;
        }
        if (dependencyDetail.state !== 'open') continue;
        backlogSummaries.push({ number: dependencyNumber, title: dependencyDetail.title });
      }

      effectiveScope.add(dependencyNumber);
      const existingExpansion = expansions.find(expansion => expansion.issueNumber === dependencyNumber);
      if (existingExpansion) {
        if (!existingExpansion.requestedBy.includes(current.requestedBy)) {
          existingExpansion.requestedBy.push(current.requestedBy);
          existingExpansion.requestedBy.sort((a, b) => a - b);
        }
      } else {
        expansions.push({
          issueNumber: dependencyNumber,
          requestedBy: [current.requestedBy],
        });
      }

      queue.push({
        issueNumber: dependencyNumber,
        requestedBy: current.requestedBy,
      });
    }
  }

  return { effectiveScope, expansions, errors };
}

async function hydrateScopedIssues(
  config: AgentConfig,
  listedIssues: GitHubIssueListItem[],
  issueScope?: Set<number>,
  cache?: SchedulerRunCache,
): Promise<{ issues: GitHubIssueListItem[]; errors: string[] }> {
  if (!issueScope) return { issues: listedIssues, errors: [] };

  const hydrated: GitHubIssueListItem[] = [];
  const errors: string[] = [];
  const listedByNumber = new Map(listedIssues.map(issue => [issue.number, issue]));

  for (const issueNumber of issueScope) {
    const listedIssue = listedByNumber.get(issueNumber);
    if (listedIssue) {
      hydrated.push(listedIssue);
      continue;
    }

    const detail = await getIssueDetail(config, issueNumber, cache);
    if (!detail) {
      errors.push(`Failed to fetch requested issue #${issueNumber} from GitHub. Check gh connectivity.`);
      continue;
    }
    if (detail.state !== 'open') continue;

    hydrated.push({
      number: detail.number,
      title: detail.title,
      state: detail.state,
      labels: detail.labels,
      createdAt: detail.createdAt,
    });
  }

  return { issues: hydrated, errors };
}

export async function buildRankedBacklog(
  config: AgentConfig,
  store: MemoryStore,
  cache?: SchedulerRunCache,
): Promise<RankedBacklog> {
  const search = config.labels?.length
    ? config.labels.map(label => `label:${label}`).join(' ')
    : undefined;
  const listStart = nowMs();
  emitBacklogEvent(config, {
    type: 'backlog_progress',
    phase: 'listing',
    message: 'Listing open GitHub issues.',
  });
  const listed = await discoverListedIssues(config, search, cache);
  const expansionSeed = config.issues?.length && config.labels?.length
    ? await discoverListedIssues(config, undefined, cache, 'listedUnfiltered')
    : listed;
  emitBacklogEvent(config, {
    type: 'backlog_timing',
    phase: 'listing',
    durationMs: nowMs() - listStart,
    count: (listed.issues ?? []).length,
  });

  const scopeStart = nowMs();
  emitBacklogEvent(config, {
    type: 'backlog_progress',
    phase: 'scope_expansion',
    message: config.issues?.length
      ? `Resolving scoped dependencies for ${config.issues.length} requested issue(s).`
      : 'No scoped dependency expansion required.',
  });
  const { effectiveScope: issueScope, expansions, errors: scopeErrors } = await expandIssueScope(config, expansionSeed.issues ?? [], cache);
  emitBacklogEvent(config, {
    type: 'backlog_timing',
    phase: 'scope_expansion',
    durationMs: nowMs() - scopeStart,
    count: expansions.length,
  });

  const hydrationStart = nowMs();
  emitBacklogEvent(config, {
    type: 'backlog_progress',
    phase: 'hydration',
    message: issueScope
      ? `Hydrating ${issueScope.size} scoped issue(s).`
      : `Hydrating up to ${(listed.issues ?? []).length} listed issue(s).`,
    total: issueScope?.size ?? (listed.issues ?? []).length,
  });
  const { issues: scopedIssues, errors: hydrateErrors } = await hydrateScopedIssues(config, listed.issues ?? [], issueScope, cache);
  emitBacklogEvent(config, {
    type: 'backlog_timing',
    phase: 'hydration',
    durationMs: nowMs() - hydrationStart,
    count: scopedIssues.length,
  });
  const errors = [
    ...(listed.error ? [listed.error] : []),
    ...scopeErrors,
    ...hydrateErrors,
  ];

  const baseIssues = scopedIssues.filter(issue => {
    if (issueScope && !issueScope.has(issue.number)) return false;
    if (!issueScope && config.labels?.length) {
      return config.labels.some(label => issue.labels.includes(label));
    }
    return true;
  });

  const memories = await store.read({ type: 'work_log', limit: 200 });
  const persistedContext = await getPersistedContext(config, cache);
  const codebaseContext = buildCodebaseContext(persistedContext);

  const enrichmentStart = nowMs();
  emitBacklogEvent(config, {
    type: 'backlog_progress',
    phase: 'enrichment',
    message: `Enriching ${baseIssues.length} issue(s) with details and feature state.`,
    total: baseIssues.length,
  });
  const enrichmentErrors: string[] = [];
  let enrichedCount = 0;
  const candidateResults = await mapWithConcurrency(baseIssues, ENRICHMENT_CONCURRENCY, async (issue) => {
    const detail = await getIssueDetail(config, issue.number, cache);
    if (!detail) {
      enrichmentErrors.push(`Failed to fetch issue #${issue.number} from GitHub while enriching backlog. Check gh connectivity.`);
      return null;
    }
    const featureName = deriveFeatureNameFromTitle(detail.title || issue.title);
    const featureState = await getFeatureState(config, issue.number, featureName, cache);
    const hintedDependencies = extractDependencyHints(
      detail.body ?? '',
      scopedIssues.map(scopedIssue => ({ number: scopedIssue.number, title: scopedIssue.title })),
      issue.number,
    );
    const dependsOn = await resolveOpenDependencies(config, hintedDependencies, scopedIssues, cache);
    const attemptState = getAttemptState(memories, issue.number);

    const candidate: BacklogCandidate = {
      issueNumber: issue.number,
      title: detail.title || issue.title,
      labels: detail.labels ?? issue.labels ?? [],
      body: detail.body ?? '',
      createdAt: issue.createdAt,
      phase: 'idle',
      scopeOrigin: issueScope
        ? (config.issues?.includes(issue.number) ? 'requested' : 'dependency')
        : undefined,
      requestedBy: expansions.find(expansion => expansion.issueNumber === issue.number)?.requestedBy,
      priorityTier: derivePriorityTier(detail.labels ?? issue.labels ?? []),
      dependsOn,
      explicitDependencyEdges: dependsOn.map((targetIssue) => ({
        sourceIssue: issue.number,
        targetIssue,
        kind: 'explicit' as const,
        confidence: 'high' as const,
        blocking: true,
        evidence: { summary: `Issue body explicitly references #${targetIssue} as a prerequisite.` },
      })),
      inferredDependencyEdges: [],
      attemptState,
      featureState: {
        recommendation: featureState.recommendation,
        hasExistingBranch: featureState.branch.exists,
        commitsAhead: featureState.branch.commitsAhead,
        hasPlan: featureState.plan.exists,
        hasOpenPr: featureState.pr.state === 'OPEN' || featureState.linkedPr.state === 'OPEN',
      },
      loopFeatureName: featureName,
      recommendation: featureState.recommendation,
    };
    enrichedCount += 1;
    if (enrichedCount === 1 || enrichedCount === baseIssues.length || enrichedCount % 5 === 0) {
      emitBacklogEvent(config, {
        type: 'backlog_progress',
        phase: 'enrichment',
        message: `Enriched ${enrichedCount}/${baseIssues.length} issue(s).`,
        completed: enrichedCount,
        total: baseIssues.length,
      });
    }
    return candidate;
  });
  const candidates = candidateResults.filter((candidate): candidate is BacklogCandidate => candidate != null);
  errors.push(...enrichmentErrors);
  emitBacklogEvent(config, {
    type: 'backlog_timing',
    phase: 'enrichment',
    durationMs: nowMs() - enrichmentStart,
    count: candidates.length,
  });

  const preliminaryEnforcedDependencyMap = new Map<number, DependencyEdge[]>();
  for (const candidate of candidates) {
    preliminaryEnforcedDependencyMap.set(candidate.issueNumber, [...candidate.explicitDependencyEdges]);
  }

  for (const candidate of candidates) {
    const adjacency = new Map<number, number[]>();
    for (const [issueNumber, edges] of preliminaryEnforcedDependencyMap.entries()) {
      adjacency.set(issueNumber, edges.map(edge => edge.targetIssue));
    }
    const hasCycle = detectCycleForIssue(candidate.issueNumber, adjacency, new Set<number>(), new Set<number>());
    if (hasCycle) {
      candidate.actionability = 'blocked_cycle';
      candidate.blockedBy = [{ issueNumber: candidate.issueNumber, reason: 'Dependency cycle detected.' }];
    } else {
      candidate.actionability = evaluateActionability(candidate, preliminaryEnforcedDependencyMap, issueScope);
    }
    candidate.selectionReasons = buildSelectionReasons(candidate);
    candidate.score = buildScore(candidate);
  }

  const modelInferenceCandidates = new Set(
    [...candidates]
      .sort((left, right) => {
        const leftScore = left.score?.total ?? 0;
        const rightScore = right.score?.total ?? 0;
        if (rightScore !== leftScore) return rightScore - leftScore;
        return left.issueNumber - right.issueNumber;
      })
      .slice(0, issueScope ? candidates.length : Math.min(candidates.length, MAX_MODEL_INFERENCE_CANDIDATES))
      .map(candidate => candidate.issueNumber),
  );

  const inferenceStart = nowMs();
  emitBacklogEvent(config, {
    type: 'backlog_progress',
    phase: 'dependency_inference',
    message: issueScope
      ? `Inferring dependencies for ${candidates.length} scoped issue(s).`
      : `Inferring dependencies for top ${modelInferenceCandidates.size} of ${candidates.length} issue(s) before first rank.`,
    total: modelInferenceCandidates.size,
  });
  let inferredCount = 0;
  await mapWithConcurrency(candidates, INFERENCE_CONCURRENCY, async (candidate) => {
    if (!modelInferenceCandidates.has(candidate.issueNumber)) {
      candidate.inferredDependencyEdges = [];
      candidate.inferredDependsOn = [];
      return;
    }

    candidate.inferredDependencyEdges = await inferDependencyEdges(config, candidate, candidates, codebaseContext);
    candidate.inferredDependsOn = candidate.inferredDependencyEdges.map((edge) => ({
      issueNumber: edge.targetIssue,
      confidence: edge.confidence,
    }));
    inferredCount += 1;
    if (inferredCount === 1 || inferredCount === modelInferenceCandidates.size || inferredCount % 5 === 0) {
      emitBacklogEvent(config, {
        type: 'backlog_progress',
        phase: 'dependency_inference',
        message: `Analyzed dependencies for ${inferredCount}/${modelInferenceCandidates.size} issue(s).`,
        completed: inferredCount,
        total: modelInferenceCandidates.size,
      });
    }
  });
  emitBacklogEvent(config, {
    type: 'backlog_timing',
    phase: 'dependency_inference',
    durationMs: nowMs() - inferenceStart,
    count: modelInferenceCandidates.size,
  });

  const enforcedDependencyMap = new Map<number, DependencyEdge[]>();
  for (const candidate of candidates) {
    const enforced = [
      ...candidate.explicitDependencyEdges,
      ...candidate.inferredDependencyEdges.filter(edge => edge.confidence === 'high'),
    ];
    enforcedDependencyMap.set(candidate.issueNumber, enforced);
  }

  const adjacency = new Map<number, number[]>();
  for (const [issueNumber, edges] of enforcedDependencyMap.entries()) {
    adjacency.set(issueNumber, edges.map(edge => edge.targetIssue));
  }

  const visited = new Set<number>();
  for (const candidate of candidates) {
    const hasCycle = detectCycleForIssue(candidate.issueNumber, adjacency, new Set<number>(), visited);
    if (hasCycle) {
      candidate.actionability = 'blocked_cycle';
      candidate.blockedBy = [{ issueNumber: candidate.issueNumber, reason: 'Dependency cycle detected.' }];
    } else {
      candidate.actionability = evaluateActionability(candidate, enforcedDependencyMap, issueScope);
    }
    candidate.selectionReasons = buildSelectionReasons(candidate);
    candidate.score = buildScore(candidate);
  }

  const rankingStart = nowMs();
  emitBacklogEvent(config, {
    type: 'backlog_progress',
    phase: 'ranking',
    message: `Ranking ${candidates.length} issue(s).`,
    total: candidates.length,
  });
  const queue = [...candidates].sort((left, right) => {
    const leftScore = left.score?.total ?? 0;
    const rightScore = right.score?.total ?? 0;
    if (rightScore !== leftScore) return rightScore - leftScore;
    return left.issueNumber - right.issueNumber;
  });
  emitBacklogEvent(config, {
    type: 'backlog_timing',
    phase: 'ranking',
    durationMs: nowMs() - rankingStart,
    count: queue.length,
  });

  return {
    queue,
    actionable: queue.filter(
      candidate => candidate.actionability === 'ready'
        || candidate.actionability === 'housekeeping'
        || candidate.actionability === 'waiting_pr',
    ),
    blocked: queue.filter(
      candidate => candidate.actionability !== 'ready'
        && candidate.actionability !== 'housekeeping'
        && candidate.actionability !== 'waiting_pr',
    ),
    expansions,
    errors,
  };
}

export function toIssueStates(queue: BacklogCandidate[]): AgentIssueState[] {
  return queue.map(toIssueState);
}
