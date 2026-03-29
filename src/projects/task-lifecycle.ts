import { createSubsystemLogger } from "../logging/subsystem.js";
import {
  createInternalHookEvent,
  triggerInternalHook,
} from "../hooks/internal-hooks.js";
import { handleTaskPreComplete } from "../hooks/bundled/verification-hook.js";

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
