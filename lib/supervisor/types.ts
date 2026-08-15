/** Cursor Research Supervisor — shared types (prototype + autonomous loop). */

/** Task/detection outcome status */
export type SupervisorStatus = "COMPLETE" | "ERROR" | "WAITING" | "UNKNOWN";

/** Autonomous loop state machine states */
export type SupervisorLoopState =
  | "IDLE"
  | "DISPATCH"
  | "WAIT"
  | "EVALUATE"
  | "SELECT_NEXT"
  | "STOP";

/** Dedupe cursor for one-shot detection logging */
export interface SupervisorDedupeState {
  lastEventFingerprint?: string;
  lastCheckedAt?: string;
}

export type DetectionSource = "transcript" | "outbox_result" | "synthetic" | "none";

export interface GitSnapshot {
  branch: string;
  statusSummary: string;
  changedFileCount: number;
  changedFiles?: string[];
  diffStat?: string;
}

export interface TranscriptRef {
  filePath: string;
  lineNumber: number;
  transcriptKind: "parent" | "subagent";
  transcriptId: string;
}

export interface DetectionResult {
  status: SupervisorStatus;
  source: DetectionSource;
  reportText: string;
  taskText: string;
  errorMessage?: string;
  transcriptRef?: TranscriptRef;
  limitations: string[];
  detectedAt: string;
}

export interface ResearchLogEntry {
  id: string;
  timestamp: string;
  status: SupervisorStatus;
  taskText: string;
  reportText: string;
  errorMessage?: string;
  git: GitSnapshot;
  detection: {
    source: DetectionSource;
    transcriptRef?: TranscriptRef;
    limitations: string[];
  };
}

export interface SyntheticTranscriptFixture {
  name: string;
  lines: string[];
}

// --- Autonomous loop types ---

export type TaskCategory =
  | "audit"
  | "diagnostic"
  | "test-fix"
  | "build-fix"
  | "refactor"
  | "research-infra"
  | "docs"
  | "experiment";

export type StopReason =
  | "human_input_required"
  | "credentials_or_secrets"
  | "deployment_proposed"
  | "git_push_proposed"
  | "git_commit_proposed"
  | "order_placement_proposed"
  | "destructive_deletion"
  | "production_trading_logic"
  | "tickstream_yahoo_authority"
  | "strategy_substantial_change"
  | "repeated_test_failures"
  | "repeated_build_failures"
  | "unsafe_task_scope"
  | "low_confidence_next_task"
  | "max_iterations_reached"
  | "autonomous_disabled"
  | "cursor_wait_timeout"
  | "task_quality_failed"
  | "manual_stop"
  | "no_next_task";

export interface SupervisorTask {
  id: string;
  title: string;
  prompt: string;
  category: TaskCategory;
  verifyScript?: string;
  allowedPaths?: string[];
  /** Queue task ids that must complete before this task runs. */
  dependsOn?: string[];
  priority: number;
  confidence: number;
}

export interface CursorDetectionResult {
  detected: boolean;
  method: "turn_ended" | "transcript_assistant" | "outbox_result" | "synthetic" | "none";
  reliability: "high" | "medium" | "low" | "synthetic";
  limitations: string[];
  transcriptPath?: string;
  turnEndedStatus?: "success" | "error";
  reportText: string;
  rawStatus: SupervisorStatus;
}

export interface ParsedCursorResult {
  outcome: SupervisorStatus;
  summary: string;
  reportText: string;
  errors: string[];
  waitingSignals: string[];
  humanInputSignals: string[];
}

export interface VerificationResult {
  script: string;
  ran: boolean;
  passed: boolean;
  output: string;
  durationMs: number;
}

export interface BuildResult {
  ran: boolean;
  passed: boolean;
  output: string;
  durationMs: number;
}

export interface EvaluationResult {
  outcome: SupervisorStatus;
  parsed: ParsedCursorResult;
  git: GitSnapshot;
  verification?: VerificationResult;
  build: BuildResult;
  stopReasons: StopReason[];
  safeToContinue: boolean;
}

export interface NextTaskSelection {
  task: SupervisorTask | null;
  reason: string;
  confidence: number;
  stopped: boolean;
  stopReason?: StopReason;
  /** Persistent queue task id (when selected from queue.json). */
  queueTaskId?: string;
  /** True when resuming a running queue task after restart (skip re-dispatch). */
  resumed?: boolean;
}

/** Structured fields extracted deterministically from a Cursor result report. */
export interface ExtractedResultFields {
  testsFailed: boolean;
  testsPassed: boolean;
  buildFailed: boolean;
  buildPassed: boolean;
  followUpLines: string[];
  unresolvedIssues: string[];
  filesChanged: string[];
  completedWorkSummary: string;
  suspicious: boolean;
  malformed: boolean;
}

/** Inputs for result-driven next-task generation. */
export interface ResultContext {
  reportText: string;
  parsed: ParsedCursorResult;
  completedTask: SupervisorTask;
  evaluation?: EvaluationResult;
  extracted: ExtractedResultFields;
}

/** One generated next task before queue/safety gates. */
export interface GeneratedNextTask {
  task: SupervisorTask;
  reason: string;
  selectionRule:
    | "fix_failure"
    | "explicit_follow_up"
    | "verify_uncertain"
    | "add_validation"
    | "improve_reliability"
    | "research_backlog";
  safetyClassification: TaskCategory;
}

/** Result of generateNextTask — may propose zero or one task. */
export interface GenerateNextTaskResult {
  generated: SupervisorTask | null;
  reason: string;
  selectionRule?: GeneratedNextTask["selectionRule"];
  stopped: boolean;
  stopReason?: StopReason;
  aiUsed: false;
}

/** Enqueue outcome after quality gate + memory checks. */
export interface EnqueueNextTaskResult extends GenerateNextTaskResult {
  enqueued: boolean;
  queueTaskId?: string;
  blocked?: boolean;
  blockReason?: string;
}

/** DRY-RUN next-task proposal — enqueues PENDING only, never claims or dispatches. */
export interface NextTaskProposalResult {
  proposed: SupervisorTask | null;
  reason: string;
  enqueued: boolean;
  queueTaskId?: string;
  stopped: boolean;
  stopReason?: StopReason;
  dryRun: true;
}

/** Optional AI provider — stub for future; generator is deterministic by default. */
export interface NextTaskAiProvider {
  suggestTask(context: ResultContext): Promise<SupervisorTask | null>;
}

/** Synthetic Cursor report fixture for next-task proposal tests. */
export interface CursorReportFixture {
  name: string;
  reportText: string;
  completedTask: SupervisorTask;
  rawStatus?: SupervisorStatus;
  expectStopped?: boolean;
  expectEnqueued?: boolean;
  expectProposalId?: string;
  expectProposalCategory?: TaskCategory;
  expectStopReason?: StopReason;
}

export interface TranscriptBaseline {
  rootTranscriptPath: string;
  lineCount: number;
  mtimeMs: number;
}

export interface DispatchedTask {
  taskId: string;
  dispatchedAt: string;
  outboxPath: string;
  inboxPath: string;
  method: "file_outbox" | "synthetic";
  transcriptBaseline?: TranscriptBaseline;
}

export interface ExecutionLogEntry {
  iteration: number;
  timestamp: string;
  state: SupervisorLoopState;
  taskIssued?: SupervisorTask;
  dispatch?: DispatchedTask;
  cursorResult?: CursorDetectionResult;
  parsed?: ParsedCursorResult;
  evaluation?: EvaluationResult;
  git?: GitSnapshot;
  verification?: VerificationResult;
  build?: BuildResult;
  nextTask?: SupervisorTask | null;
  nextTaskReason?: string;
  confidence?: number;
  stopReason?: StopReason;
  dryRun: boolean;
  autonomous: boolean;
}

export interface SupervisorRunOptions {
  dryRun: boolean;
  autonomous: boolean;
  maxIterations: number;
  pollIntervalMs: number;
  waitTimeoutMs: number;
  projectRoot: string;
  /** Override queue data root (tests use temp dirs). */
  queueRoot?: string;
  /** Import backlog.json when queue is empty (default true; set false in tests). */
  /** When false, skip backlog/synthetic queue seeding (tests use intentional queue state). */
  seedFromBacklog?: boolean;
  /** Endurance/tests: override dry-run synthetic Cursor report text per task. */
  syntheticResultFn?: (task: SupervisorTask, iteration: number) => string;
  /** Endurance/tests: skip writing a result file to simulate Cursor timeout. */
  simulateTimeoutForTask?: (task: SupervisorTask) => boolean;
  /** Endurance/tests: mark timeout as failed and continue to next task instead of stopping. */
  continueAfterTimeout?: boolean;
  /** Endurance/tests: skip result-driven next-task generation after each evaluation. */
  skipNextTaskGeneration?: boolean;
  /** Endurance/tests: override Cursor transcript scan directory (use nonexistent path to disable). */
  transcriptRoot?: string;
  /** Max concurrent independent tasks (1 = sequential legacy mode). */
  maxParallel?: number;
  /** Enable adaptive scaling (uses adaptive-config.json when maxParallel unset or >1). */
  adaptiveConcurrency?: boolean;
  /** Tests: inject machine metrics instead of sampling OS. */
  metricsOverride?: {
    cpuUsagePct: number;
    ramUsagePct: number;
    totalRamMb?: number;
    freeRamMb?: number;
  };
  /** Force parallel batch loop even when maxParallel is 1 (benchmark/tests). */
  forceParallelLoop?: boolean;
}

export interface SupervisorRunResult {
  iterations: number;
  stopped: boolean;
  stopReason?: StopReason;
  entries: ExecutionLogEntry[];
}

/** @deprecated Use SupervisorDedupeState — kept for logger compat */
export type SupervisorState = SupervisorDedupeState;

// --- Persistent task queue ---

export type QueueTaskStatus = "pending" | "running" | "completed" | "failed" | "blocked";

export interface QueueTask {
  id: string;
  createdAt: string;
  prompt: string;
  reason: string;
  priority: number;
  status: QueueTaskStatus;
  title?: string;
  category?: TaskCategory;
  verifyScript?: string;
  allowedPaths?: string[];
  confidence?: number;
  completedAt?: string;
  errorMessage?: string;
  /** Set when status becomes running — used by stuck-task watchdog. */
  startedAt?: string;
  /** Task ids that must be completed before this task can run. */
  dependsOn?: string[];
  /** Human took control — supervisor must not redispatch or modify. */
  humanControlled?: boolean;
  /** Set when human cancelled the task. */
  cancelledByHuman?: boolean;
}

/** Recorded when watchdog blocks a task that exceeded runningTimeoutMs. */
export interface WatchdogRecord {
  taskId: string;
  startedAt: string;
  timeoutMs: number;
  reason: string;
  blockedAt: string;
}

export interface WatchdogOptions {
  /** Max ms a task may stay in running before blocked (default 30 min). */
  runningTimeoutMs?: number;
  /** Override queue data root for watchdog log (tests use temp dirs). */
  root?: string;
  /** Fixed clock for tests. */
  nowMs?: number;
}

export interface QueueSnapshot {
  maxSize: number;
  tasks: QueueTask[];
}

export interface CreateQueueTaskInput {
  prompt: string;
  reason: string;
  priority: number;
  /** Optional stable id (backlog seed); auto-generated when omitted. */
  id?: string;
  title?: string;
  category?: TaskCategory;
  verifyScript?: string;
  allowedPaths?: string[];
  confidence?: number;
  dependsOn?: string[];
}

export interface TaskQueueOptions {
  root?: string;
  maxSize?: number;
}

// --- Research memory (compact local persistence) ---

export type MemoryTaskStatus = "completed" | "failed" | "blocked";

export interface MemoryTaskRecord {
  taskId: string;
  title?: string;
  category?: TaskCategory;
  verifyScript?: string;
  status: MemoryTaskStatus;
  timestamp: string;
  summary?: string;
  errorMessage?: string;
  stopReason?: string;
}

export type MemoryFindingKind = "finding" | "limitation" | "state";

export interface MemoryFinding {
  id: string;
  timestamp: string;
  taskId?: string;
  topic: string;
  text: string;
  kind: MemoryFindingKind;
}

export interface MemoryProjectState {
  updatedAt: string;
  lastStopReason?: StopReason;
  consecutiveTestFailures: number;
  consecutiveBuildFailures: number;
  queueSummary?: Partial<Record<QueueTaskStatus, number>>;
  notes?: string[];
}

export interface MemoryTaskIndex {
  completed: string[];
  failed: string[];
  blocked: string[];
}

export interface SupervisorMemorySnapshot {
  version: 1;
  updatedAt: string;
  projectState: MemoryProjectState;
  knownLimitations: string[];
  taskIndex: MemoryTaskIndex;
  /** verifyScript / topic keys already investigated — skip re-dispatch */
  investigatedTopics: string[];
}

export interface ResearchMemoryOptions {
  root?: string;
  maxIndexSize?: number;
}

// --- Human override control ---

export type SupervisorControlMode = "autonomous" | "paused" | "stopped";

export interface SupervisorControlState {
  version: 1;
  mode: SupervisorControlMode;
  updatedAt: string;
  terminateRunningRequested?: boolean;
  lastIntervention?: {
    command: string;
    at: string;
    taskId?: string;
    reason?: string;
  };
}

export interface InterventionLogEntry {
  command: string;
  timestamp: string;
  taskId?: string;
  reason?: string;
  modeAfter: SupervisorControlMode;
}
