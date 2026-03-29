import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { generateQueueMd, generateProjectMd, generateTaskMd } from "./templates.js";
import { QueueManager } from "./queue-manager.js";
import {
  clearInternalHooks,
  registerInternalHook,
  type InternalHookEvent,
} from "../hooks/internal-hooks.js";
import { completeTask } from "./task-lifecycle.js";

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
