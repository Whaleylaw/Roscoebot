import fs from "node:fs/promises";
import path from "node:path";
import { createSubsystemLogger } from "../../logging/subsystem.js";
import {
  checkpointPath,
  readCheckpoint,
  writeCheckpoint,
  createCheckpoint,
} from "../../projects/checkpoint.js";
import type { CheckpointData } from "../../projects/checkpoint.js";
import { parseTaskFrontmatter } from "../../projects/frontmatter.js";
import { QueueManager } from "../../projects/queue-manager.js";
import { runVerification } from "../../projects/verification.js";
import type { VerificationEvidence, VerificationRecord } from "../../projects/verification.js";
import { registerInternalHook, isProjectTaskPreCompleteEvent } from "../internal-hooks.js";

const log = createSubsystemLogger("hooks/verification");

export type HandleTaskPreCompleteOpts = {
  taskId: string;
  workflowId: string | null;
  projectDir: string;
  agentId: string;
  sessionKey?: string;
};

export type HandleTaskPreCompleteResult = {
  outcome: "done" | "review" | "available";
};

/**
 * Build a VerificationRecord from verification evidence for checkpoint storage.
 * Appends to existing history if a prior record exists.
 */
function buildVerificationRecord(
  evidence: VerificationEvidence,
  passed: boolean,
  existingRecord?: VerificationRecord,
): VerificationRecord {
  const history = existingRecord?.history ? [...existingRecord.history] : [];
  history.push({
    timestamp: evidence.timestamp,
    passed,
    checks_summary: `${evidence.checks.filter((c) => c.passed).length}/${evidence.checks.length} passed`,
  });
  return {
    last_run: evidence.timestamp,
    passed,
    verification_type: evidence.verification_type,
    checks: evidence.checks,
    human_review: existingRecord?.human_review,
    history,
  };
}

/**
 * Gate function for task completion. Reads task frontmatter, runs verification
 * based on verification_type, and moves the task to the appropriate queue section.
 *
 * This is called by completeTask() and must never be bypassed.
 */
export async function handleTaskPreComplete(
  opts: HandleTaskPreCompleteOpts,
): Promise<HandleTaskPreCompleteResult> {
  const { taskId, projectDir, agentId } = opts;
  const taskFilePath = path.join(projectDir, "tasks", `${taskId}.md`);
  const cpPath = checkpointPath(taskFilePath);
  const qm = new QueueManager(projectDir);

  // Read task frontmatter
  const taskContent = await fs.readFile(taskFilePath, "utf8");
  const parseResult = parseTaskFrontmatter(taskContent, taskFilePath);
  if (!parseResult.success) {
    log.error("Failed to parse task frontmatter for verification gate", { taskId });
    // Cannot verify -- move back to available as safety measure
    await qm.moveTask(taskId, "claimed", "available");
    return { outcome: "available" };
  }

  const {
    verification_type: verificationType,
    success_criteria: successCriteria,
    side_effect_class: sideEffectClass,
    approval_required: approvalRequired,
  } = parseResult.data;

  // Read existing checkpoint (may be null if none yet)
  const existingCp = await readCheckpoint(cpPath);
  const baseCp: CheckpointData = existingCp ?? createCheckpoint({ agentId, taskId });

  if (verificationType === "human" || verificationType === "external") {
    // Skip auto checks entirely -- route straight to review
    const record = buildVerificationRecord(
      { checks: [], timestamp: new Date().toISOString(), verification_type: verificationType },
      true, // No auto checks to fail
      baseCp.verification,
    );
    record.human_review = { status: "pending" };

    await qm.moveTask(taskId, "claimed", "review");
    await writeCheckpoint(cpPath, {
      ...baseCp,
      status: "review",
      verification: record,
    });
    log.info("Task routed to review (human/external verification)", { taskId, verificationType });
    return { outcome: "review" };
  }

  if (verificationType === "mixed") {
    // Run auto checks first; pass -> review, fail -> available
    const result = await runVerification(successCriteria, "mixed", projectDir);
    const record = buildVerificationRecord(result.evidence, result.passed, baseCp.verification);

    if (result.passed) {
      record.human_review = { status: "pending" };
      await qm.moveTask(taskId, "claimed", "review");
      await writeCheckpoint(cpPath, { ...baseCp, status: "review", verification: record });
      log.info("Task routed to review (mixed: auto passed, awaiting human)", { taskId });
      return { outcome: "review" };
    }

    // Auto checks failed -- back to available
    await qm.moveTask(taskId, "claimed", "available");
    await writeCheckpoint(cpPath, { ...baseCp, status: "in-progress", verification: record });
    log.info("Task returned to available (mixed: auto checks failed)", { taskId });
    return { outcome: "available" };
  }

  // Default: verification_type = "automatic"
  const result = await runVerification(successCriteria, "automatic", projectDir);
  const record = buildVerificationRecord(result.evidence, result.passed, baseCp.verification);

  if (!result.passed) {
    // Failed -- move back to available
    await qm.moveTask(taskId, "claimed", "available");
    await writeCheckpoint(cpPath, { ...baseCp, status: "in-progress", verification: record });
    log.info("Task returned to available (automatic verification failed)", { taskId });
    return { outcome: "available" };
  }

  // Passed -- check side-effect gating
  const needsHumanGate = sideEffectClass === "irreversible" || approvalRequired;

  if (needsHumanGate) {
    record.human_review = { status: "pending" };
    await qm.moveTask(taskId, "claimed", "review");
    await writeCheckpoint(cpPath, { ...baseCp, status: "review", verification: record });
    log.info("Task routed to review (side-effect gate)", { taskId, sideEffectClass, approvalRequired });
    return { outcome: "review" };
  }

  // Auto passed + no human gate -> done
  await qm.moveTask(taskId, "claimed", "done");
  await writeCheckpoint(cpPath, { ...baseCp, status: "done", verification: record });
  log.info("Task completed (automatic verification passed)", { taskId });
  return { outcome: "done" };
}

/**
 * Register the verification hook for observability logging on pre-complete events.
 * The actual gating logic lives in handleTaskPreComplete, which is called
 * directly by completeTask().
 */
export function registerVerificationHook(): void {
  registerInternalHook("project:task-pre-complete", async (event) => {
    if (!isProjectTaskPreCompleteEvent(event)) return;
    log.info("Task pre-complete event received", {
      taskId: event.context.taskId,
      projectDir: event.context.projectDir,
    });
  });
}
