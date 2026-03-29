import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { parseWorkflowFrontmatter } from "../../projects/frontmatter.js";
import {
  generateTaskMd,
  generateWorkflowMd,
  generateQueueMd,
  generateProjectMd,
} from "../../projects/templates.js";
import {
  clearInternalHooks,
  createInternalHookEvent,
  triggerInternalHook,
} from "../internal-hooks.js";
import { registerWorkflowStatusHook } from "./workflow-status-hook.js";

describe("workflow-status-hook", () => {
  let tmpDir: string;

  /** Set up a minimal project scaffold with a workflow and task files. */
  async function setupProject(opts?: {
    taskStatuses?: Record<string, string>;
    workflowStatus?: string;
  }): Promise<{ projectDir: string; workflowId: string; taskIds: string[] }> {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "wf-hook-"));
    const projectDir = tmpDir;
    await fs.mkdir(path.join(projectDir, "tasks"), { recursive: true });
    await fs.mkdir(path.join(projectDir, "workflows"), { recursive: true });

    await fs.writeFile(
      path.join(projectDir, "PROJECT.md"),
      generateProjectMd({ name: "test-project" }),
      "utf-8",
    );
    await fs.writeFile(path.join(projectDir, "queue.md"), generateQueueMd(), "utf-8");

    const taskStatuses = opts?.taskStatuses ?? { "TASK-001": "done", "TASK-002": "done" };
    const taskIds = Object.keys(taskStatuses);

    // Create task files with appropriate statuses
    for (const [taskId, status] of Object.entries(taskStatuses)) {
      const content = generateTaskMd(
        {
          id: taskId,
          title: `Task ${taskId}`,
          workflow: "WF-001",
        },
        {
          objective: "Test",
          context: "Test",
          actionGuidance: "Test",
          successCriteria: "Test",
          verificationMethod: "Test",
        },
      );
      // Replace "backlog" status with the desired status in the frontmatter
      const updated = content.replace(/status: backlog/, `status: ${status}`);
      await fs.writeFile(path.join(projectDir, "tasks", `${taskId}.md`), updated, "utf-8");
    }

    // Create workflow file referencing all task IDs
    const wfContent = generateWorkflowMd({
      id: "WF-001",
      title: "Test Workflow",
      goal: "Test goal",
      tasks: taskIds,
    });
    // Optionally set a non-default workflow status
    const wfStatus = opts?.workflowStatus ?? "active";
    const wfUpdated = wfContent.replace(/status: draft/, `status: ${wfStatus}`);
    await fs.writeFile(path.join(projectDir, "workflows", "WF-001.md"), wfUpdated, "utf-8");

    return { projectDir, workflowId: "WF-001", taskIds };
  }

  beforeEach(() => {
    registerWorkflowStatusHook();
  });

  afterEach(async () => {
    clearInternalHooks();
    if (tmpDir) {
      await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    }
  });

  it("when all tasks are done, workflow status becomes 'completed'", async () => {
    const { projectDir, workflowId } = await setupProject({
      taskStatuses: { "TASK-001": "done", "TASK-002": "done" },
      workflowStatus: "active",
    });

    const event = createInternalHookEvent("project", "task-complete", "test-session", {
      taskId: "TASK-001",
      workflowId,
      projectDir,
    });
    await triggerInternalHook(event);

    const wfContent = await fs.readFile(path.join(projectDir, "workflows", "WF-001.md"), "utf-8");
    const parsed = parseWorkflowFrontmatter(wfContent, "WF-001.md");
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.status).toBe("completed");
    }
  });

  it("when some tasks are done but others are not, workflow status stays 'active'", async () => {
    const { projectDir, workflowId } = await setupProject({
      taskStatuses: { "TASK-001": "done", "TASK-002": "in-progress" },
      workflowStatus: "active",
    });

    const event = createInternalHookEvent("project", "task-complete", "test-session", {
      taskId: "TASK-001",
      workflowId,
      projectDir,
    });
    await triggerInternalHook(event);

    const wfContent = await fs.readFile(path.join(projectDir, "workflows", "WF-001.md"), "utf-8");
    const parsed = parseWorkflowFrontmatter(wfContent, "WF-001.md");
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.status).toBe("active");
    }
  });

  it("when workflowId is null, hook is a no-op", async () => {
    const { projectDir } = await setupProject({
      taskStatuses: { "TASK-001": "done", "TASK-002": "done" },
      workflowStatus: "active",
    });

    const event = createInternalHookEvent("project", "task-complete", "test-session", {
      taskId: "TASK-001",
      workflowId: null,
      projectDir,
    });
    await triggerInternalHook(event);

    // Workflow should remain unchanged
    const wfContent = await fs.readFile(path.join(projectDir, "workflows", "WF-001.md"), "utf-8");
    const parsed = parseWorkflowFrontmatter(wfContent, "WF-001.md");
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.status).toBe("active");
    }
  });

  it("reads task files to check completion status (tasks are source of truth)", async () => {
    // One task file says "done" but the other says "backlog" even though
    // the event says task-complete -- the hook checks actual file status
    const { projectDir, workflowId } = await setupProject({
      taskStatuses: { "TASK-001": "done", "TASK-002": "backlog" },
      workflowStatus: "active",
    });

    const event = createInternalHookEvent("project", "task-complete", "test-session", {
      taskId: "TASK-001",
      workflowId,
      projectDir,
    });
    await triggerInternalHook(event);

    const wfContent = await fs.readFile(path.join(projectDir, "workflows", "WF-001.md"), "utf-8");
    const parsed = parseWorkflowFrontmatter(wfContent, "WF-001.md");
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      // Should stay active since not all tasks are done
      expect(parsed.data.status).toBe("active");
    }
  });

  it("when workflow has draft status and a task completes, workflow moves to active", async () => {
    const { projectDir, workflowId } = await setupProject({
      taskStatuses: { "TASK-001": "done", "TASK-002": "in-progress" },
      workflowStatus: "draft",
    });

    const event = createInternalHookEvent("project", "task-complete", "test-session", {
      taskId: "TASK-001",
      workflowId,
      projectDir,
    });
    await triggerInternalHook(event);

    const wfContent = await fs.readFile(path.join(projectDir, "workflows", "WF-001.md"), "utf-8");
    const parsed = parseWorkflowFrontmatter(wfContent, "WF-001.md");
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.status).toBe("active");
    }
  });
});
