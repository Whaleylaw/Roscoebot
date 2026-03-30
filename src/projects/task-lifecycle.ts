import { handleTaskPreComplete } from "../hooks/bundled/verification-hook.js";
import { createInternalHookEvent, triggerInternalHook } from "../hooks/internal-hooks.js";
import { createSubsystemLogger } from "../logging/subsystem.js";
import { executeRecoveryStrategy } from "./recovery-manager.js";
import type { FailureCategory } from "./recovery-types.js";

const log = createSubsystemLogger("projects/task-lifecycle");

export type CompleteTaskOpts = {
  taskId: string;
  workflowId: string | null;
  projectDir: string;
  agentId: string;
  sessionKey?: string;
};

export type CompleteTaskResult = {
  outcome: "done" | "review" | "available";
};

/**
 * Single entry point for task completion. Agents/gateway MUST call this
 * when reporting task completion -- it ensures handleTaskPreComplete is
 * always invoked as the verification gate.
 *
 * Flow:
 * 1. Fire observability "project:task-pre-complete" hook
 * 2. Call handleTaskPreComplete() -- the actual gate that reads frontmatter,
 *    runs verification, and moves the task in the queue
 * 3. If outcome is "done", fire "project:task-complete" so downstream hooks
 *    (like workflow-status-hook) can react
 * 4. Return the outcome
 */
export async function completeTask(opts: CompleteTaskOpts): Promise<CompleteTaskResult> {
  const { taskId, workflowId, projectDir, agentId, sessionKey } = opts;

  // Fire observability hook (fire-and-forget pattern -- errors caught by triggerInternalHook)
  await triggerInternalHook(
    createInternalHookEvent("project", "task-pre-complete", sessionKey ?? "", {
      taskId,
      workflowId,
      projectDir,
      agentId,
    }),
  );

  // Run the verification gate
  const result = await handleTaskPreComplete({
    taskId,
    workflowId,
    projectDir,
    agentId,
    sessionKey,
  });

  // Only fire task-complete when the task actually reached Done
  if (result.outcome === "done") {
    await triggerInternalHook(
      createInternalHookEvent("project", "task-complete", sessionKey ?? "", {
        taskId,
        workflowId,
        projectDir,
      }),
    );
    log.info("Task completed and hooks fired", { taskId });
  } else {
    log.info("Task did not reach done state", { taskId, outcome: result.outcome });
  }

  return result;
}

export type FailTaskOpts = {
  taskId: string;
  workflowId: string | null;
  projectDir: string;
  agentId: string;
  failureCategory: FailureCategory;
  failureReason: string;
  sessionKey?: string;
};

export type FailTaskResult = {
  outcome: "retry" | "decompose" | "reroute" | "escalate";
};

/**
 * Single entry point for task failure reporting. Agents/gateway MUST call
 * this when reporting task failure -- it ensures the recovery chain executes
 * and observability hooks fire in the correct order.
 *
 * Flow:
 * 1. Call executeRecoveryStrategy() -- the recovery chain that reads checkpoint,
 *    selects a strategy, and executes it (updating checkpoint and queue)
 * 2. Fire "project:task-failed" hook AFTER recovery execution so hook handlers
 *    see the updated checkpoint state (recovery_attempts, status, etc.)
 * 3. Return the recovery outcome
 */
export async function failTask(opts: FailTaskOpts): Promise<FailTaskResult> {
  const { taskId, workflowId, projectDir, agentId, failureCategory, failureReason, sessionKey } =
    opts;

  // Execute recovery chain FIRST so checkpoint is updated before hook fires
  const result = await executeRecoveryStrategy({
    taskId,
    workflowId,
    projectDir,
    agentId,
    failureCategory,
    failureReason,
    sessionKey,
  });

  // Fire observability hook AFTER recovery strategy execution
  // This ensures hook handlers see the updated checkpoint state
  // (recovery_attempts, status, etc.) and the recovery outcome
  await triggerInternalHook(
    createInternalHookEvent("project", "task-failed", sessionKey ?? "", {
      taskId,
      workflowId,
      projectDir,
      agentId,
      failureCategory,
      failureReason,
      recoveryOutcome: result.outcome,
    }),
  );

  log.info("Task failure processed", { taskId, outcome: result.outcome, failureCategory });

  return result;
}
