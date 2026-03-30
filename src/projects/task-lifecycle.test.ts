import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  clearInternalHooks,
  registerInternalHook,
  type InternalHookEvent,
} from "../hooks/internal-hooks.js";
import { checkpointPath, createCheckpoint, writeCheckpoint } from "./checkpoint.js";
import { QueueManager } from "./queue-manager.js";
import { completeTask, failTask } from "./task-lifecycle.js";
import { generateQueueMd, generateProjectMd, generateTaskMd } from "./templates.js";

describe("task-lifecycle completeTask", () => {
  let tmpDir: string;

  async function setupProject(taskOpts: {
    id?: string;
    verification_type?: string;
    side_effect_class?: string;
    approval_required?: boolean;
    success_criteria?: Array<Record<string, unknown>>;
  }): Promise<{ projectDir: string; taskId: string }> {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "lifecycle-test-"));
    const projectDir = tmpDir;
    await fs.mkdir(path.join(projectDir, "tasks"), { recursive: true });

    await fs.writeFile(
      path.join(projectDir, "PROJECT.md"),
      generateProjectMd({ name: "test-project" }),
      "utf-8",
    );
    await fs.writeFile(path.join(projectDir, "queue.md"), generateQueueMd(), "utf-8");

    const taskId = taskOpts.id ?? "TASK-001";
    const content = generateTaskMd(
      {
        id: taskId,
        title: `Test ${taskId}`,
        verification_type: taskOpts.verification_type ?? "automatic",
        side_effect_class: taskOpts.side_effect_class ?? "none",
        approval_required: taskOpts.approval_required ?? false,
        success_criteria: taskOpts.success_criteria ?? [],
      },
      {
        objective: "Test",
        context: "Test",
        actionGuidance: "Test",
        successCriteria: "Test",
        verificationMethod: "Test",
      },
    );
    await fs.writeFile(path.join(projectDir, "tasks", `${taskId}.md`), content, "utf-8");

    const qm = new QueueManager(projectDir);
    await qm.addTasks([{ taskId, metadata: {} }]);
    await qm.claimTask(taskId, "agent-1");

    return { projectDir, taskId };
  }

  afterEach(async () => {
    clearInternalHooks();
    if (tmpDir) {
      await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    }
  });

  it("calls handleTaskPreComplete and returns its outcome", async () => {
    const { projectDir, taskId } = await setupProject({
      verification_type: "automatic",
      success_criteria: [{ type: "command", cmd: "echo ok", expect: 0 }],
    });

    const result = await completeTask({
      taskId,
      workflowId: null,
      projectDir,
      agentId: "agent-1",
    });

    expect(result.outcome).toBe("done");
  });

  it("fires project:task-complete hook when outcome is done", async () => {
    const captured: InternalHookEvent[] = [];
    registerInternalHook("project:task-complete", async (event) => {
      captured.push(event);
    });

    const { projectDir, taskId } = await setupProject({
      verification_type: "automatic",
      success_criteria: [{ type: "command", cmd: "echo ok", expect: 0 }],
    });

    await completeTask({
      taskId,
      workflowId: null,
      projectDir,
      agentId: "agent-1",
    });

    expect(captured).toHaveLength(1);
    expect(captured[0].action).toBe("task-complete");
    expect(captured[0].context).toMatchObject({ taskId, projectDir });
  });

  it("does NOT fire project:task-complete hook when outcome is review", async () => {
    const captured: InternalHookEvent[] = [];
    registerInternalHook("project:task-complete", async (event) => {
      captured.push(event);
    });

    const { projectDir, taskId } = await setupProject({
      verification_type: "human",
    });

    const result = await completeTask({
      taskId,
      workflowId: null,
      projectDir,
      agentId: "agent-1",
    });

    expect(result.outcome).toBe("review");
    expect(captured).toHaveLength(0);
  });

  it("does NOT fire project:task-complete hook when outcome is available", async () => {
    const captured: InternalHookEvent[] = [];
    registerInternalHook("project:task-complete", async (event) => {
      captured.push(event);
    });

    const { projectDir, taskId } = await setupProject({
      verification_type: "automatic",
      success_criteria: [{ type: "file_exists", path: "nonexistent.txt" }],
    });

    const result = await completeTask({
      taskId,
      workflowId: null,
      projectDir,
      agentId: "agent-1",
    });

    expect(result.outcome).toBe("available");
    expect(captured).toHaveLength(0);
  });

  it("fires project:task-pre-complete observability hook before gating", async () => {
    const captured: InternalHookEvent[] = [];
    registerInternalHook("project:task-pre-complete", async (event) => {
      captured.push(event);
    });

    const { projectDir, taskId } = await setupProject({
      verification_type: "automatic",
      success_criteria: [],
    });

    await completeTask({
      taskId,
      workflowId: null,
      projectDir,
      agentId: "agent-1",
    });

    expect(captured).toHaveLength(1);
    expect(captured[0].action).toBe("task-pre-complete");
    expect(captured[0].context).toMatchObject({ taskId, projectDir, agentId: "agent-1" });
  });
});

describe("task-lifecycle failTask", () => {
  let tmpDir: string;

  async function setupFailProject(): Promise<{ projectDir: string; taskId: string }> {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "failTask-test-"));
    const projectDir = tmpDir;
    await fs.mkdir(path.join(projectDir, "tasks"), { recursive: true });

    await fs.writeFile(
      path.join(projectDir, "PROJECT.md"),
      generateProjectMd({ name: "test-project" }),
      "utf-8",
    );
    await fs.writeFile(path.join(projectDir, "queue.md"), generateQueueMd(), "utf-8");

    const taskId = "TASK-001";
    const content = generateTaskMd(
      { id: taskId, title: `Test ${taskId}` },
      {
        objective: "Test",
        context: "Test",
        actionGuidance: "Test",
        successCriteria: "Test",
        verificationMethod: "Test",
      },
    );
    await fs.writeFile(path.join(projectDir, "tasks", `${taskId}.md`), content, "utf-8");

    const qm = new QueueManager(projectDir);
    await qm.addTasks([{ taskId, metadata: {} }]);
    await qm.claimTask(taskId, "agent-1");

    // Create checkpoint for claimed task
    const taskFilePath = path.join(projectDir, "tasks", `${taskId}.md`);
    const cp = createCheckpoint({ agentId: "agent-1", taskId });
    await writeCheckpoint(checkpointPath(taskFilePath), cp);

    return { projectDir, taskId };
  }

  afterEach(async () => {
    clearInternalHooks();
    if (tmpDir) {
      await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    }
  });

  it("delegates to executeRecoveryStrategy and returns its outcome", async () => {
    const { projectDir, taskId } = await setupFailProject();

    const result = await failTask({
      taskId,
      workflowId: null,
      projectDir,
      agentId: "agent-1",
      failureCategory: "transient",
      failureReason: "Timeout",
    });

    expect(result.outcome).toBe("retry");
  });

  it("fires project:task-failed hook AFTER recovery execution with recoveryOutcome", async () => {
    const callOrder: string[] = [];

    // Register hook to track when it fires
    registerInternalHook("project:task-failed", async (event) => {
      callOrder.push("hook-fired");
      expect(event.context.recoveryOutcome).toBe("retry");
      expect(event.context.failureCategory).toBe("transient");
      expect(event.context.failureReason).toBe("Timeout");
      expect(event.context.taskId).toBe("TASK-001");
    });

    const { projectDir, taskId } = await setupFailProject();

    await failTask({
      taskId,
      workflowId: null,
      projectDir,
      agentId: "agent-1",
      failureCategory: "transient",
      failureReason: "Timeout",
    });

    // Hook must have fired
    expect(callOrder).toContain("hook-fired");
  });

  it("passes recoveryOutcome in the hook event context", async () => {
    const captured: InternalHookEvent[] = [];
    registerInternalHook("project:task-failed", async (event) => {
      captured.push(event);
    });

    const { projectDir, taskId } = await setupFailProject();

    await failTask({
      taskId,
      workflowId: null,
      projectDir,
      agentId: "agent-1",
      failureCategory: "transient",
      failureReason: "Timeout",
    });

    expect(captured).toHaveLength(1);
    expect(captured[0].context.recoveryOutcome).toBe("retry");
    expect(captured[0].action).toBe("task-failed");
  });

  it("hook fires after recovery (checkpoint is updated before hook)", async () => {
    const { projectDir, taskId } = await setupFailProject();

    let checkpointAtHookTime: number | null = null;
    registerInternalHook("project:task-failed", async () => {
      // Read checkpoint inside hook to verify it was updated before hook fired
      const { readCheckpoint } = await import("./checkpoint.js");
      const taskFilePath = path.join(projectDir, "tasks", `${taskId}.md`);
      const cp = await readCheckpoint(checkpointPath(taskFilePath));
      checkpointAtHookTime = cp?.recovery_attempts ?? null;
    });

    await failTask({
      taskId,
      workflowId: null,
      projectDir,
      agentId: "agent-1",
      failureCategory: "transient",
      failureReason: "Timeout",
    });

    // Checkpoint should have been updated BEFORE hook fired
    expect(checkpointAtHookTime).toBe(1);
  });
});
