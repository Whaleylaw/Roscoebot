// Schemas
export {
  ProjectFrontmatterSchema,
  TaskFrontmatterSchema,
  QueueFrontmatterSchema,
  WorkflowFrontmatterSchema,
  SuccessCriterionSchema,
  WORKFLOW_ID_PATTERN,
} from "./schemas.js";

// Types
export type {
  SuccessCriterion,
  ProjectFrontmatter,
  TaskFrontmatter,
  QueueFrontmatter,
  WorkflowFrontmatter,
  ParseResult,
  ParseError,
  TaskMdBody,
} from "./types.js";

// Errors
export { formatWarning } from "./errors.js";
export type { FrontmatterParseWarning } from "./errors.js";

// Parsers (frontmatter.ts will exist once Plan 01-02 completes)
export {
  parseProjectFrontmatter,
  parseTaskFrontmatter,
  parseQueueFrontmatter,
  parseWorkflowFrontmatter,
} from "./frontmatter.js";

// Queue
export { parseQueue } from "./queue-parser.js";
export type { QueueEntry, ParsedQueue } from "./queue-parser.js";

// Scaffold
export { ProjectManager, ensureWorkflowsDir, writeFileAtomic } from "./scaffold.js";
export type { CreateProjectOpts, CreateSubProjectOpts } from "./scaffold.js";
export {
  generateProjectMd,
  generateQueueMd,
  generateWorkflowMd,
  generateTaskMd,
} from "./templates.js";

// Sync types
export type { SyncEvent, ProjectIndex, TaskIndex, BoardIndex, QueueIndex } from "./sync-types.js";

// Index generation
export {
  generateProjectIndex,
  generateTaskIndex,
  generateBoardIndex,
  generateQueueIndex,
  writeIndexFile,
  generateAllIndexes,
} from "./index-generator.js";

// Sync service
export { ProjectSyncService } from "./sync-service.js";

// Queue manager (concurrency-safe writes)
export {
  QueueManager,
  serializeQueue,
  QueueLockError,
  QueueValidationError,
  QUEUE_LOCK_OPTIONS,
} from "./queue-manager.js";
export type { QueueSection } from "./queue-manager.js";

// Capability matching
export { matchCapabilities } from "./capability-matcher.js";

// Capability registry (project-level validation)
export { validateCapabilities, STANDARD_CAPABILITIES } from "./capability-registry.js";
export type { StandardCapability } from "./capability-registry.js";

// Orchestrator (decomposition validation + batch creation + goal pipeline)
export {
  validateTaskGraph,
  createTaskBatch,
  orchestrateGoal,
  parseOrchestratorPayload,
} from "./orchestrator.js";
export type {
  DecomposedTask,
  ValidationResult,
  CreateTaskBatchOpts,
  CreateTaskBatchResult,
  OrchestrateGoalOpts,
  OrchestrateGoalResult,
  OrchestratorPayload,
  ParsePayloadResult,
} from "./orchestrator.js";

// Checkpoint (interruption/resume support)
export { createCheckpoint, readCheckpoint, writeCheckpoint, checkpointPath } from "./checkpoint.js";
export type { CheckpointData } from "./checkpoint.js";

// Verification (check runners + types)
export { runFileExistsCheck, runCommandCheck } from "./verification.js";
export type {
  CheckResult,
  VerificationEvidence,
  VerificationResult,
  VerificationRecord,
} from "./verification.js";

// Heartbeat scanner (agent task pickup)
export { scanAndClaimTask } from "./heartbeat-scanner.js";
export type { ScanAndClaimResult, ScanAndClaimOpts } from "./heartbeat-scanner.js";
