import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { generateQueueMd, generateProjectMd, generateTaskMd } from "../../projects/templates.js";
import { QueueManager } from "../../projects/queue-manager.js";
import { readCheckpoint, checkpointPath } from "../../projects/checkpoint.js";
import { parseQueue } from "../../projects/queue-parser.js";
import { clearInternalHooks } from "../internal-hooks.js";
import { handleTaskPreComplete } from "./verification-hook.js";

describe("verification-hook", () => {
  let tmpDir: string;

  /** Create a minimal project with a single task in the Claimed queue section. */
  async function setupProject(taskOpts: {
    id?: string;
    verification_type?: string;
    side_effect_class?: string;
    approval_required?: boolean;
    success_criteria?: Array<Record<string, unknown>>;
  }): Promise<{ projectDir: string; taskId: string }> {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "vhook-test-"));
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

    // Add task to Available, then claim it
    const qm = new QueueManager(projectDir);
    await qm.addTasks([{ taskId, metadata: {} }]);
    await qm.claimTask(taskId, "agent-1");

    return { projectDir, taskId };
  }

  beforeEach(() => {
    // Hooks cleared before each test for isolation
  });

  afterEach(async () => {
    clearInternalHooks();
    if (tmpDir) {
      await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    }
  });

  it("automatic + all checks pass -> task moves to Done", async () => {
    const { projectDir, taskId } = await setupProject({
      verification_type: "automatic",
      success_criteria: [{ type: "command", cmd: "echo ok", expect: 0 }],
    });

    const result = await handleTaskPreComplete({
      taskId,
      workflowId: null,
      projectDir,
      agentId: "agent-1",
    });

    expect(result.outcome).toBe("done");

    // Verify task is in Done queue section
    const queueContent = await fs.readFile(path.join(projectDir, "queue.md"), "utf8");
    const parsed = parseQueue(queueContent, "queue.md");
    expect(parsed.done.some((e) => e.taskId === taskId)).toBe(true);
    expect(parsed.claimed.some((e) => e.taskId === taskId)).toBe(false);

    // Verify checkpoint
    const taskPath = path.join(projectDir, "tasks", `${taskId}.md`);
    const cp = await readCheckpoint(checkpointPath(taskPath));
    expect(cp).not.toBeNull();
    expect(cp!.verification?.passed).toBe(true);
  });

  it("automatic + check fails -> task moves to Available", async () => {
    const { projectDir, taskId } = await setupProject({
      verification_type: "automatic",
      success_criteria: [{ type: "file_exists", path: "nonexistent.txt" }],
    });

    const result = await handleTaskPreComplete({
      taskId,
      workflowId: null,
      projectDir,
      agentId: "agent-1",
    });

    expect(result.outcome).toBe("available");

    const queueContent = await fs.readFile(path.join(projectDir, "queue.md"), "utf8");
    const parsed = parseQueue(queueContent, "queue.md");
    expect(parsed.available.some((e) => e.taskId === taskId)).toBe(true);
    expect(parsed.claimed.some((e) => e.taskId === taskId)).toBe(false);

    // Checkpoint should record failure
    const taskPath = path.join(projectDir, "tasks", `${taskId}.md`);
    const cp = await readCheckpoint(checkpointPath(taskPath));
    expect(cp).not.toBeNull();
    expect(cp!.verification?.passed).toBe(false);
  });

  it("side_effect_class=irreversible + automatic pass -> task moves to Review (HIL-03)", async () => {
    const { projectDir, taskId } = await setupProject({
      verification_type: "automatic",
      side_effect_class: "irreversible",
      success_criteria: [{ type: "command", cmd: "echo ok", expect: 0 }],
    });

    const result = await handleTaskPreComplete({
      taskId,
      workflowId: null,
      projectDir,
      agentId: "agent-1",
    });

    expect(result.outcome).toBe("review");

    const queueContent = await fs.readFile(path.join(projectDir, "queue.md"), "utf8");
    const parsed = parseQueue(queueContent, "queue.md");
    expect(parsed.review.some((e) => e.taskId === taskId)).toBe(true);

    // Checkpoint should have pending human review
    const taskPath = path.join(projectDir, "tasks", `${taskId}.md`);
    const cp = await readCheckpoint(checkpointPath(taskPath));
    expect(cp!.verification?.human_review?.status).toBe("pending");
  });

  it("approval_required=true + automatic pass -> task moves to Review (HIL-03)", async () => {
    const { projectDir, taskId } = await setupProject({
      verification_type: "automatic",
      approval_required: true,
      success_criteria: [{ type: "command", cmd: "echo ok", expect: 0 }],
    });

    const result = await handleTaskPreComplete({
      taskId,
      workflowId: null,
      projectDir,
      agentId: "agent-1",
    });

    expect(result.outcome).toBe("review");
  });

  it("side_effect_class=none + automatic pass -> task moves to Done (HIL-02)", async () => {
    const { projectDir, taskId } = await setupProject({
      verification_type: "automatic",
      side_effect_class: "none",
      success_criteria: [{ type: "command", cmd: "echo ok", expect: 0 }],
    });

    const result = await handleTaskPreComplete({
      taskId,
      workflowId: null,
      projectDir,
      agentId: "agent-1",
    });

    expect(result.outcome).toBe("done");
  });

  it("side_effect_class=reversible + automatic pass -> task moves to Done (HIL-02)", async () => {
    const { projectDir, taskId } = await setupProject({
      verification_type: "automatic",
      side_effect_class: "reversible",
      success_criteria: [{ type: "command", cmd: "echo ok", expect: 0 }],
    });

    const result = await handleTaskPreComplete({
      taskId,
      workflowId: null,
      projectDir,
      agentId: "agent-1",
    });

    expect(result.outcome).toBe("done");
  });

  it("handleTaskPreComplete returns { outcome } discriminated result", async () => {
    const { projectDir, taskId } = await setupProject({
      verification_type: "automatic",
      success_criteria: [],
    });

    const result = await handleTaskPreComplete({
      taskId,
      workflowId: null,
      projectDir,
      agentId: "agent-1",
    });

    expect(result).toHaveProperty("outcome");
    expect(["done", "review", "available"]).toContain(result.outcome);
  });
});
