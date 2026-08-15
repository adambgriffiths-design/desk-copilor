export type {
  BuildResult,
  CreateQueueTaskInput,
  CursorDetectionResult,
  DetectionResult,
  DetectionSource,
  DispatchedTask,
  EvaluationResult,
  ExecutionLogEntry,
  GitSnapshot,
  NextTaskSelection,
  NextTaskProposalResult,
  NextTaskAiProvider,
  EnqueueNextTaskResult,
  GenerateNextTaskResult,
  GeneratedNextTask,
  ExtractedResultFields,
  ResultContext,
  CursorReportFixture,
  ParsedCursorResult,
  QueueSnapshot,
  QueueTask,
  QueueTaskStatus,
  ResearchLogEntry,
  StopReason,
  SupervisorDedupeState,
  SupervisorLoopState,
  SupervisorRunOptions,
  SupervisorRunResult,
  SupervisorState,
  SupervisorStatus,
  SupervisorTask,
  SyntheticTranscriptFixture,
  TaskQueueOptions,
  TranscriptBaseline,
  TranscriptRef,
  VerificationResult,
  WatchdogOptions,
  WatchdogRecord,
  MemoryFinding,
  MemoryFindingKind,
  MemoryProjectState,
  MemoryTaskIndex,
  MemoryTaskRecord,
  MemoryTaskStatus,
  ResearchMemoryOptions,
  SupervisorMemorySnapshot,
  SupervisorControlMode,
  SupervisorControlState,
  InterventionLogEntry,
} from "./types";

export { captureGitSnapshot } from "./git";
export {
  analyzeTranscriptLines,
  buildDetectionFromAnalysis,
  detectFromCursorTranscripts,
  detectFromTranscriptFile,
  detectFromTranscriptLines,
  eventFingerprint,
  findLatestTranscriptFile,
} from "./detector";
export {
  captureTranscriptBaseline,
  CURSOR_DETECTION_LIMITATIONS,
  detectCursorCompletion,
  detectLiveAutonomousCompletion,
  getDetectionDocumentation,
  inferOutcomeFromText,
} from "./completion";
export { parseCursorResult, parseMalformedResult, extractResultFields } from "./result-parser";
export { evaluateTaskResult, runBuild, runVerification } from "./evaluator";
export {
  assessTaskQuality,
  getQualityGateDocumentation,
  MAX_TASK_PROMPT_CHARS,
  parseQualityGateBlockMessage,
  qualityGateBlockMessage,
  shouldBlockBeforeDispatch,
  validSupervisorTestPrompt,
} from "./quality-gate";
export type { QualityGateContext, QualityGateExistingTask, QualityGateRejection, QualityGateResult } from "./quality-gate";
export { runQualityGateTests } from "./quality-gate.test";
export {
  assessSafety,
  getSafetyDocumentation,
  isTaskAutoAllowed,
  shouldStopBeforeDispatch,
} from "./safety";
export {
  getNextTaskDocumentation,
  loadBacklog,
  getDefaultBacklogTasks,
  queueTaskToSupervisorTask,
  seedQueueFromBacklog,
  seedSyntheticDryRunTasks,
  selectInitialTask,
  selectNextTask,
  supervisorTaskToQueueInput,
  syntheticDryRunTasks,
  syntheticResultForTask,
} from "./next-task";
export {
  ALL_CURSOR_REPORT_FIXTURES,
  FIXTURE_COMPLETE_CLEAN,
  FIXTURE_COMPLETE_WITH_TODO,
  FIXTURE_ERROR_BUILD_FAIL,
  FIXTURE_ERROR_TEST_FAIL,
  FIXTURE_FRESH_QUEUE,
  FIXTURE_UNSAFE_DEPLOY,
  FIXTURE_WAITING_HUMAN,
  cursorReportFixtureByName,
} from "./next-task-fixtures";
export {
  getNextTaskProposalDocumentation,
  matchesExpectedCategory,
  proposeNextTaskDryRun,
  seedQueueForFixture,
  type ProposeNextTaskOptions,
} from "./next-task-proposal";
export {
  buildResultContextFromReport,
  generateAndEnqueueNextTask,
  generateNextTask,
  getNextTaskGeneratorDocumentation,
  noopNextTaskAiProvider,
  readTaskResultReport,
  type EnqueueNextTaskOptions,
  type GenerateNextTaskOptions,
} from "./next-task-generator";
export { runNextTaskGeneratorTests } from "./next-task-generator.test";
export {
  dispatchTaskToCursor,
  getDispatcherDocumentation,
  resultFilePath,
  writeSyntheticResult,
} from "./dispatcher";
export type { ClaimResult, InboxTaskPayload, InboxTaskStatus } from "./pickup";
export {
  claimNextPending,
  claimTaskById,
  formatPickupPrompt,
  getPickupDocumentation,
  getTaskPickupStatus,
  listPendingTasks,
  markTaskCompleted,
  markTaskFailed,
  releaseTaskClaim,
} from "./pickup";
export {
  formatLivePickupContext,
  getLivePickupDocumentation,
  PENDING_PICKUP_PATH,
  readPendingPickupSignal,
  refreshPendingPickupSignal,
} from "./live-pickup";
export { SupervisorStateMachine, TRANSITIONS } from "./state-machine";
export { runSupervisorLoop } from "./runner";
export {
  applyHumanControlToRunner,
  cmdCancel,
  cmdPause,
  cmdPriority,
  cmdResume,
  cmdStatus,
  cmdStop,
  cmdTakeover,
  filterSupervisorManagedRunning,
  isPausedOrStopped,
  loadControlState,
  saveControlState,
  shouldDispatchNewTasks,
  shouldTerminateRunning,
} from "./intervention";
export type { InterventionCommand, InterventionOptions, StatusReport } from "./intervention";
export {
  atomicWriteControlState,
  loadQueueSnapshot,
  SUPERVISOR_CONTROL_PATH,
} from "./control-state";
export { runSupervisor, runSupervisorParallelLoop, selectInitialParallelOrSingle } from "./parallel-runner";
export {
  batchCompatible,
  canRunInParallel,
  DEFAULT_MAX_PARALLEL,
  dependenciesSatisfied,
  getParallelSchedulerDocumentation,
  isReadOnlyTask,
  scopePathsConflict,
  selectParallelBatch,
  selectResumedParallelBatch,
} from "./parallel-scheduler";
export {
  ADAPTIVE_CONFIG_FILENAME,
  AdaptiveConcurrencyController,
  getAdaptiveConcurrencyDocumentation,
  loadAdaptiveConfig,
  resetCpuSampleCache,
  sampleMachineMetrics,
  sampleMachineProfile,
  saveAdaptiveConfig,
  syntheticBenchmarkTasks,
} from "./adaptive-concurrency";
export type {
  AdaptiveBatchOutcome,
  AdaptiveConcurrencyConfig,
  AdaptiveScaleDecision,
  MachineMetrics,
} from "./adaptive-concurrency";
export {
  appendThroughputLog,
  summarizeUsefulOutput,
  SUPERVISOR_THROUGHPUT_LOG,
} from "./throughput-log";
export type { ThroughputLogEntry } from "./throughput-log";
export {
  buildReconciliationTask,
  detectFindingConflict,
  enqueueReconciliationTask,
} from "./conflict-reconciliation";
export type { FindingConflict } from "./conflict-reconciliation";
export {
  appendExecutionLog,
  appendResearchLog,
  buildLogEntry,
  loadSupervisorState,
  logDetection,
  readResearchLog,
  saveSupervisorState,
} from "./logger";
export {
  classifyInProgress,
  extractReportText,
  extractUserTask,
  mapTurnStatus,
  parseTranscriptLine,
} from "./parser";
export {
  cursorProjectSlug,
  defaultCursorTranscriptsDir,
  ensureSupervisorDataRoot,
  ensureSupervisorDirs,
  SUPERVISOR_BACKLOG_PATH,
  SUPERVISOR_DATA_ROOT,
  SUPERVISOR_EXECUTIONS_LOG,
  SUPERVISOR_HISTORY_PATH,
  SUPERVISOR_INBOX_DIR,
  SUPERVISOR_MEMORY_FINDINGS_PATH,
  SUPERVISOR_MEMORY_PATH,
  SUPERVISOR_MEMORY_TASKS_PATH,
  SUPERVISOR_OUTBOX_DIR,
  SUPERVISOR_QUEUE_PATH,
  SUPERVISOR_RESULTS_DIR,
  SUPERVISOR_STATE_PATH,
} from "./paths";
export {
  createTaskQueue,
  DEFAULT_MAX_QUEUE_SIZE,
  QueueFullError,
  QueueTaskNotFoundError,
  TaskQueue,
} from "./queue";
export {
  appendWatchdogLog,
  checkAndBlockTimedOutTasks,
  DEFAULT_RUNNING_TIMEOUT_MS,
  elapsedRunningMs,
  getWatchdogDocumentation,
  isTaskTimedOut,
  readWatchdogLog,
  WATCHDOG_BLOCK_REASON,
} from "./watchdog";
export type { WatchdogCheckResult } from "./watchdog";
export {
  DEFAULT_MAX_INDEX_SIZE,
  getMemoryDocumentation,
  loadMemorySnapshot,
  readMemoryFindings,
  readMemoryTasks,
  recordFinding,
  recordTaskOutcome,
  ResearchMemory,
  saveMemorySnapshot,
  shouldSkipTaskFromMemory,
  summarizeQueueTasks,
  topicKeyForTask,
  updateMemoryProjectState,
} from "./memory";
export {
  ALL_SYNTHETIC_FIXTURES,
  SYNTHETIC_COMPLETE,
  SYNTHETIC_EMPTY,
  SYNTHETIC_ERROR,
  SYNTHETIC_MALFORMED_REPORT,
  SYNTHETIC_UNKNOWN,
  SYNTHETIC_WAITING,
  syntheticFixtureByName,
} from "./synthetic";
