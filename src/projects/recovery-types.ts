/**
 * Recovery type foundations for the orchestration layer.
 * Defines failure categories, recovery strategies, and the pure
 * strategy-selection function used by the recovery manager,
 * heartbeat gate, and resume scanner.
 */

/** Classification of why a task failed. */
export type FailureCategory = "transient" | "permanent" | "unknown";

/**
 * Discriminated union describing the recovery action to take.
 * The fixed priority chain is: retry -> decompose -> reroute -> escalate.
 */
export type RecoveryStrategy =
  | { action: "retry"; backoffMs: number }
  | { action: "decompose"; parentTaskId: string }
  | { action: "reroute"; targetCapabilities: string[] }
  | { action: "escalate"; reason: string };

/** Input options for failing a task through the recovery pipeline. */
export type FailTaskOpts = {
  taskId: string;
  workflowId: string | null;
  projectDir: string;
  agentId: string;
  failureCategory: FailureCategory;
  failureReason: string;
  sessionKey?: string;
};

/** Result of the fail-task operation indicating which recovery path was taken. */
export type FailTaskResult = { outcome: "retry" | "decompose" | "reroute" | "escalate" };

/** Exponential backoff delays matching delivery-queue-recovery pattern (D-01). */
export const BACKOFF_MS: readonly number[] = [5_000, 25_000, 120_000, 600_000];

/** Default maximum retry attempts before moving to next strategy (D-07). */
export const DEFAULT_MAX_RETRIES = 3;

/** Maximum task decomposition depth, matching orchestrator.ts (D-02). */
export const MAX_DECOMPOSITION_DEPTH = 2;

/**
 * Pure function implementing the D-01 fixed priority chain:
 * retry -> decompose -> reroute -> escalate.
 *
 * Each step is skipped when its preconditions are not met,
 * falling through to the next strategy in the chain.
 */
export function selectRecoveryStrategy(opts: {
  failureCategory: FailureCategory;
  recoveryAttempts: number;
  maxRetries: number;
  decompositionDepth: number;
  maxDecompositionDepth: number;
  alternateAgentAvailable: boolean;
  taskCapabilities: string[];
}): RecoveryStrategy {
  // Step 1: Retry -- skip for permanent failures or when budget exhausted
  if (opts.failureCategory !== "permanent" && opts.recoveryAttempts < opts.maxRetries) {
    const backoffMs = BACKOFF_MS[Math.min(opts.recoveryAttempts, BACKOFF_MS.length - 1)]!;
    return { action: "retry", backoffMs };
  }

  // Step 2: Decompose -- skip when at max depth
  if (opts.decompositionDepth < opts.maxDecompositionDepth) {
    return { action: "decompose", parentTaskId: "" };
  }

  // Step 3: Reroute -- skip when no alternate agent available
  if (opts.alternateAgentAvailable) {
    return { action: "reroute", targetCapabilities: opts.taskCapabilities };
  }

  // Step 4: Escalate -- all strategies exhausted
  return {
    action: "escalate",
    reason: `All recovery strategies exhausted: ${opts.recoveryAttempts} retries, depth ${opts.decompositionDepth}/${opts.maxDecompositionDepth}, no alternate agents`,
  };
}
