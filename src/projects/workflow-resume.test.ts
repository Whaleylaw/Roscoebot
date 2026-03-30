import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { writeCheckpoint, type CheckpointData, createCheckpoint } from "./checkpoint.js";
import {
  generateProjectMd,
  generateQueueMd,
  generateTaskMd,
  generateWorkflowMd,
} from "./templates.js";
import { STALE_CLAIM_THRESHOLD_MS } from "./heartbeat-scanner.js";
import { scanActiveWorkflows, type ResumedWorkflow, type ResumedTaskState } from "./workflow-resume.js";

describe("workflow-resume", () => {
  let tmpDir: string;

  /** Create a minimal project directory with workflows and tasks. */
  async function createProject(
    projectName: string,
    opts: {
      workflows?: Array<{
        id: string;
        title: string;
        goal: string;
        tasks: string[];
        status?: string;
      }>;
      tasks?: Array<{
        id: string;
        title: string;
        status?: string;
        depends_on?: string[];
        workflow?: string;
      }>;
      checkpoints?: Record<string, Partial<CheckpointData>>;
    } = {},
  ): Promise<string> {
    const projectDir = path.join(tmpDir, projectName);
    await fs.mkdir(path.join(projectDir, "tasks"), { recursive: true });
    await fs.mkdir(path.join(projectDir, "workflows"), { recursive: true });

    await fs.writeFile(
      path.join(projectDir, "PROJECT.md"),
      generateProjectMd({ name: projectName }),
      "utf-8",
    );
    await fs.writeFile(path.join(projectDir, "queue.md"), generateQueueMd(), "utf-8");

    // Create workflow files
    for (const wf of opts.workflows ?? []) {
      const content = generateWorkflowMd({
        id: wf.id,
        title: wf.title,
        goal: wf.goal,
        tasks: wf.tasks,
      });
      const status = wf.status ?? "active";
      const updated = content.replace(/status: draft/, `status: ${status}`);
      await fs.writeFile(path.join(projectDir, "workflows", `${wf.id}.md`), updated, "utf-8");
    }

    // Create task files
    for (const task of opts.tasks ?? []) {
      const content = generateTaskMd(
        {
          id: task.id,
          title: task.title,
          depends_on: task.depends_on ?? [],
          workflow: task.workflow ?? undefined,
        },
        {
          objective: "Test objective",
          context: "Test context",
          actionGuidance: "Test guidance",
          successCriteria: "Test criteria",
          verificationMethod: "Test verification",
        },
      );
      const status = task.status ?? "backlog";
      const updated = content.replace(/status: backlog/, `status: ${status}`);
      await fs.writeFile(path.join(projectDir, "tasks", `${task.id}.md`), updated, "utf-8");
    }

    // Create checkpoint files
    for (const [taskId, cpData] of Object.entries(opts.checkpoints ?? {})) {
      const base = createCheckpoint({ agentId: "test-agent", taskId });
      const merged: CheckpointData = { ...base, ...cpData };
      const cpPath = path.join(projectDir, "tasks", `${taskId}.checkpoint.json`);
      await writeCheckpoint(cpPath, merged);
    }

    return projectDir;
  }

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "wf-resume-"));
  });

  afterEach(async () => {
    vi.useRealTimers();
    if (tmpDir) {
      await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    }
  });

  it("returns empty array when no project directories have workflows/ dir", async () => {
    const emptyDir = path.join(tmpDir, "empty-project");
    await fs.mkdir(emptyDir, { recursive: true });
    // No workflows/ subdirectory
    const result = await scanActiveWorkflows([emptyDir]);
    expect(result).toEqual([]);
  });

  it("returns workflow with status 'active' and reconstructs per-task states", async () => {
    const projectDir = await createProject("proj1", {
      workflows: [
        { id: "WF-001", title: "Test WF", goal: "Do stuff", tasks: ["TASK-001", "TASK-002"], status: "active" },
      ],
      tasks: [
        { id: "TASK-001", title: "Task 1", status: "done", workflow: "WF-001" },
        { id: "TASK-002", title: "Task 2", status: "backlog", depends_on: ["TASK-001"], workflow: "WF-001" },
      ],
    });

    const result = await scanActiveWorkflows([projectDir]);
    expect(result).toHaveLength(1);
    expect(result[0].workflowId).toBe("WF-001");
    expect(result[0].status).toBe("active");
    expect(result[0].tasks).toHaveLength(2);
  });

  it("skips workflows with status 'draft', 'completed', or 'failed'", async () => {
    const projectDir = await createProject("proj2", {
      workflows: [
        { id: "WF-001", title: "Draft WF", goal: "Draft", tasks: ["TASK-001"], status: "draft" },
        { id: "WF-002", title: "Completed WF", goal: "Done", tasks: ["TASK-002"], status: "completed" },
        { id: "WF-003", title: "Failed WF", goal: "Fail", tasks: ["TASK-003"], status: "failed" },
      ],
      tasks: [
        { id: "TASK-001", title: "T1", status: "backlog" },
        { id: "TASK-002", title: "T2", status: "done" },
        { id: "TASK-003", title: "T3", status: "blocked" },
      ],
    });

    const result = await scanActiveWorkflows([projectDir]);
    expect(result).toEqual([]);
  });

  it("completedTasks contains task IDs where task status is 'done'", async () => {
    const projectDir = await createProject("proj3", {
      workflows: [
        { id: "WF-001", title: "WF", goal: "Goal", tasks: ["TASK-001", "TASK-002"], status: "active" },
      ],
      tasks: [
        { id: "TASK-001", title: "T1", status: "done", workflow: "WF-001" },
        { id: "TASK-002", title: "T2", status: "backlog", workflow: "WF-001" },
      ],
    });

    const result = await scanActiveWorkflows([projectDir]);
    expect(result[0].completedTasks).toEqual(["TASK-001"]);
  });

  it("claimableTasks contains task IDs where status is 'backlog' and all depends_on are 'done'", async () => {
    const projectDir = await createProject("proj4", {
      workflows: [
        { id: "WF-001", title: "WF", goal: "Goal", tasks: ["TASK-001", "TASK-002", "TASK-003"], status: "active" },
      ],
      tasks: [
        { id: "TASK-001", title: "T1", status: "done", workflow: "WF-001" },
        { id: "TASK-002", title: "T2", status: "backlog", depends_on: ["TASK-001"], workflow: "WF-001" },
        { id: "TASK-003", title: "T3", status: "backlog", depends_on: ["TASK-002"], workflow: "WF-001" },
      ],
    });

    const result = await scanActiveWorkflows([projectDir]);
    // TASK-002 is claimable (dep TASK-001 is done), TASK-003 is not (dep TASK-002 is backlog)
    expect(result[0].claimableTasks).toEqual(["TASK-002"]);
  });

  it("blockedTasks contains task IDs where task status is 'blocked'", async () => {
    const projectDir = await createProject("proj5", {
      workflows: [
        { id: "WF-001", title: "WF", goal: "Goal", tasks: ["TASK-001", "TASK-002"], status: "active" },
      ],
      tasks: [
        { id: "TASK-001", title: "T1", status: "blocked", workflow: "WF-001" },
        { id: "TASK-002", title: "T2", status: "backlog", workflow: "WF-001" },
      ],
    });

    const result = await scanActiveWorkflows([projectDir]);
    expect(result[0].blockedTasks).toEqual(["TASK-001"]);
  });

  it("interruptedTasks contains in-progress tasks with stale checkpoint", async () => {
    vi.useFakeTimers();
    const now = new Date("2026-03-30T12:00:00Z");
    vi.setSystemTime(now);

    const staleTimestamp = new Date(now.getTime() - STALE_CLAIM_THRESHOLD_MS - 60_000).toISOString();

    const projectDir = await createProject("proj6", {
      workflows: [
        { id: "WF-001", title: "WF", goal: "Goal", tasks: ["TASK-001"], status: "active" },
      ],
      tasks: [
        { id: "TASK-001", title: "T1", status: "in-progress", workflow: "WF-001" },
      ],
      checkpoints: {
        "TASK-001": {
          status: "in-progress",
          claimed_at: staleTimestamp,
          log: [{ timestamp: staleTimestamp, agent: "agent-1", action: "Claimed task" }],
        },
      },
    });

    const result = await scanActiveWorkflows([projectDir]);
    expect(result[0].interruptedTasks).toEqual(["TASK-001"]);
  });

  it("interruptedTasks is empty for in-progress tasks with recent checkpoint activity", async () => {
    vi.useFakeTimers();
    const now = new Date("2026-03-30T12:00:00Z");
    vi.setSystemTime(now);

    const recentTimestamp = new Date(now.getTime() - 60_000).toISOString(); // 1 min ago

    const projectDir = await createProject("proj7", {
      workflows: [
        { id: "WF-001", title: "WF", goal: "Goal", tasks: ["TASK-001"], status: "active" },
      ],
      tasks: [
        { id: "TASK-001", title: "T1", status: "in-progress", workflow: "WF-001" },
      ],
      checkpoints: {
        "TASK-001": {
          status: "in-progress",
          claimed_at: recentTimestamp,
          log: [{ timestamp: recentTimestamp, agent: "agent-1", action: "Claimed task" }],
        },
      },
    });

    const result = await scanActiveWorkflows([projectDir]);
    expect(result[0].interruptedTasks).toEqual([]);
  });

  it("reads checkpoint recovery_attempts for each task", async () => {
    const projectDir = await createProject("proj8", {
      workflows: [
        { id: "WF-001", title: "WF", goal: "Goal", tasks: ["TASK-001"], status: "active" },
      ],
      tasks: [
        { id: "TASK-001", title: "T1", status: "backlog", workflow: "WF-001" },
      ],
      checkpoints: {
        "TASK-001": {
          recovery_attempts: 2,
          failure_category: "transient",
        },
      },
    });

    const result = await scanActiveWorkflows([projectDir]);
    const taskState = result[0].tasks.find((t) => t.taskId === "TASK-001");
    expect(taskState).toBeDefined();
    expect(taskState!.recoveryAttempts).toBe(2);
    expect(taskState!.failureCategory).toBe("transient");
    expect(taskState!.hasCheckpoint).toBe(true);
  });

  it("handles missing task files gracefully (skip, don't crash)", async () => {
    const projectDir = await createProject("proj9", {
      workflows: [
        { id: "WF-001", title: "WF", goal: "Goal", tasks: ["TASK-001", "TASK-999"], status: "active" },
      ],
      tasks: [
        { id: "TASK-001", title: "T1", status: "done", workflow: "WF-001" },
        // TASK-999 intentionally not created
      ],
    });

    const result = await scanActiveWorkflows([projectDir]);
    expect(result).toHaveLength(1);
    // Should only have TASK-001 in the tasks list
    expect(result[0].tasks).toHaveLength(1);
    expect(result[0].tasks[0].taskId).toBe("TASK-001");
  });

  it("includes paused workflows in scan results", async () => {
    const projectDir = await createProject("proj10", {
      workflows: [
        { id: "WF-001", title: "Paused WF", goal: "Goal", tasks: ["TASK-001"], status: "paused" },
      ],
      tasks: [
        { id: "TASK-001", title: "T1", status: "backlog", workflow: "WF-001" },
      ],
    });

    const result = await scanActiveWorkflows([projectDir]);
    expect(result).toHaveLength(1);
    expect(result[0].status).toBe("paused");
  });

  it("in-progress task with no checkpoint is treated as interrupted", async () => {
    const projectDir = await createProject("proj11", {
      workflows: [
        { id: "WF-001", title: "WF", goal: "Goal", tasks: ["TASK-001"], status: "active" },
      ],
      tasks: [
        { id: "TASK-001", title: "T1", status: "in-progress", workflow: "WF-001" },
      ],
      // No checkpoint for TASK-001
    });

    const result = await scanActiveWorkflows([projectDir]);
    expect(result[0].interruptedTasks).toEqual(["TASK-001"]);
  });

  it("failedTasks contains tasks with failure_category in checkpoint that are not done", async () => {
    const projectDir = await createProject("proj12", {
      workflows: [
        { id: "WF-001", title: "WF", goal: "Goal", tasks: ["TASK-001", "TASK-002"], status: "active" },
      ],
      tasks: [
        { id: "TASK-001", title: "T1", status: "blocked", workflow: "WF-001" },
        { id: "TASK-002", title: "T2", status: "done", workflow: "WF-001" },
      ],
      checkpoints: {
        "TASK-001": { failure_category: "permanent", failure_reason: "Cannot solve" },
        "TASK-002": { failure_category: "transient" }, // done task with failure category -- should NOT be in failedTasks
      },
    });

    const result = await scanActiveWorkflows([projectDir]);
    expect(result[0].failedTasks).toEqual(["TASK-001"]);
  });
});
