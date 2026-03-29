import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, it, expect, vi } from "vitest";
import { parseWorkflowFrontmatter } from "./frontmatter.js";
import {
  validateTaskGraph,
  createTaskBatch,
  orchestrateGoal,
  parseOrchestratorPayload,
  type DecomposedTask,
} from "./orchestrator.js";
import { parseQueue } from "./queue-parser.js";
import { generateWorkflowMd, generateQueueMd, generateProjectMd } from "./templates.js";

/** Build a minimal DecomposedTask with overrides. */
function makeTask(overrides: Partial<DecomposedTask> & { id: string }): DecomposedTask {
  return {
    title: `Task ${overrides.id}`,
    priority: "medium",
    capabilities: [],
    depends_on: [],
    workflow: "WF-001",
    verification_type: "automatic",
    side_effect_class: "none",
    approval_required: false,
    estimated_size: "medium",
    parent: null,
    body: {
      objective: "Test objective",
      context: "Test context",
      actionGuidance: "Test action",
      successCriteria: "Test criteria",
      verificationMethod: "Test method",
    },
    ...overrides,
  };
}

const emptyContext = {
  allowedCapabilities: [] as string[],
  agentCapabilities: new Map<string, string[]>(),
};

describe("validateTaskGraph", () => {
  it("valid task graph with no deps returns { valid: true }", () => {
    const tasks = [makeTask({ id: "TASK-001" }), makeTask({ id: "TASK-002" })];
    const result = validateTaskGraph(tasks, emptyContext);
    expect(result).toEqual({ valid: true });
  });

  it("circular deps A->B->A returns { valid: false }", () => {
    const tasks = [
      makeTask({ id: "TASK-001", depends_on: ["TASK-002"] }),
      makeTask({ id: "TASK-002", depends_on: ["TASK-001"] }),
    ];
    const result = validateTaskGraph(tasks, emptyContext);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors.some((e) => e.includes("Circular dependency"))).toBe(true);
    }
  });

  it("circular deps A->B->C->A detected", () => {
    const tasks = [
      makeTask({ id: "TASK-001", depends_on: ["TASK-003"] }),
      makeTask({ id: "TASK-002", depends_on: ["TASK-001"] }),
      makeTask({ id: "TASK-003", depends_on: ["TASK-002"] }),
    ];
    const result = validateTaskGraph(tasks, emptyContext);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors.some((e) => e.includes("Circular dependency"))).toBe(true);
    }
  });

  it("dep referencing non-existent task returns error", () => {
    const tasks = [makeTask({ id: "TASK-001", depends_on: ["TASK-999"] })];
    const result = validateTaskGraph(tasks, emptyContext);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(
        result.errors.some((e) => e.includes("TASK-999") && e.includes("does not exist")),
      ).toBe(true);
    }
  });

  it("unregistered capability returns error with capability name", () => {
    const tasks = [makeTask({ id: "TASK-001", capabilities: ["exotic-cap"] })];
    const ctx = {
      allowedCapabilities: ["code", "research"],
      agentCapabilities: new Map([["agent-a", ["code"]]]),
    };
    const result = validateTaskGraph(tasks, ctx);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(
        result.errors.some((e) => e.includes("exotic-cap") && e.includes("unregistered")),
      ).toBe(true);
    }
  });

  it("capability with no matching agent returns error", () => {
    const tasks = [makeTask({ id: "TASK-001", capabilities: ["deploy"] })];
    const ctx = {
      allowedCapabilities: ["code", "deploy"],
      agentCapabilities: new Map([["agent-a", ["code"]]]),
    };
    const result = validateTaskGraph(tasks, ctx);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors.some((e) => e.includes("no agent can fulfill"))).toBe(true);
    }
  });

  it("task count > 50 returns error", () => {
    const tasks = Array.from({ length: 51 }, (_, i) =>
      makeTask({ id: `TASK-${String(i + 1).padStart(3, "0")}` }),
    );
    const result = validateTaskGraph(tasks, emptyContext);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors.some((e) => e.includes("exceeds maximum of 50"))).toBe(true);
    }
  });

  it("parent depth > 2 returns error (DEC-03)", () => {
    const tasks = [
      makeTask({ id: "TASK-001", parent: null }),
      makeTask({ id: "TASK-002", parent: "TASK-001" }),
      makeTask({ id: "TASK-003", parent: "TASK-002" }),
    ];
    const result = validateTaskGraph(tasks, emptyContext);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors.some((e) => e.includes("exceeds max decomposition depth"))).toBe(true);
    }
  });

  it("empty capabilities on task = valid (any agent can claim)", () => {
    const tasks = [makeTask({ id: "TASK-001", capabilities: [] })];
    const ctx = {
      allowedCapabilities: ["code"],
      agentCapabilities: new Map([["agent-a", ["code"]]]),
    };
    const result = validateTaskGraph(tasks, ctx);
    expect(result).toEqual({ valid: true });
  });

  it("empty allowedCapabilities = no restriction (valid)", () => {
    const tasks = [makeTask({ id: "TASK-001", capabilities: ["anything"] })];
    const ctx = {
      allowedCapabilities: [] as string[],
      agentCapabilities: new Map([["agent-a", ["anything"]]]),
    };
    const result = validateTaskGraph(tasks, ctx);
    expect(result).toEqual({ valid: true });
  });

  it("new custom capability string works without code changes (CAP-03)", () => {
    const tasks = [makeTask({ id: "TASK-001", capabilities: ["data-analysis"] })];
    const ctx = {
      allowedCapabilities: ["data-analysis"],
      agentCapabilities: new Map([["agent-a", ["data-analysis"]]]),
    };
    const result = validateTaskGraph(tasks, ctx);
    expect(result).toEqual({ valid: true });
  });
});

describe("createTaskBatch", () => {
  let tmpDir: string;

  /** Set up a minimal project scaffold in a temp directory. */
  async function setupProject(): Promise<string> {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "orch-batch-"));
    const projectDir = tmpDir;
    await fs.mkdir(path.join(projectDir, "tasks"), { recursive: true });
    await fs.mkdir(path.join(projectDir, "workflows"), { recursive: true });
    await fs.writeFile(
      path.join(projectDir, "PROJECT.md"),
      generateProjectMd({ name: "test-project" }),
      "utf-8",
    );
    await fs.writeFile(path.join(projectDir, "queue.md"), generateQueueMd(), "utf-8");
    return projectDir;
  }

  /** Create a workflow file and return its ID. */
  async function createWorkflow(projectDir: string, id: string): Promise<void> {
    const content = generateWorkflowMd({
      id,
      title: "Test Workflow",
      goal: "Test goal",
      tasks: [],
    });
    await fs.writeFile(path.join(projectDir, "workflows", `${id}.md`), content, "utf-8");
  }

  /** Build 3 test DecomposedTask objects. */
  function makeTestTasks(): DecomposedTask[] {
    return [
      makeTask({ id: "batch-1", title: "First task", capabilities: ["code"] }),
      makeTask({ id: "batch-2", title: "Second task", depends_on: ["batch-1"] }),
      makeTask({ id: "batch-3", title: "Third task", depends_on: ["batch-2"] }),
    ];
  }

  afterEach(async () => {
    if (tmpDir) {
      await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    }
  });

  it("creates 3 TASK-NNN.md files in tasks/ directory", async () => {
    const projectDir = await setupProject();
    await createWorkflow(projectDir, "WF-001");

    const result = await createTaskBatch({
      projectDir,
      workflowId: "WF-001",
      tasks: makeTestTasks(),
    });

    expect(result.taskIds).toHaveLength(3);
    for (const taskId of result.taskIds) {
      const taskPath = path.join(projectDir, "tasks", `${taskId}.md`);
      const exists = await fs
        .access(taskPath)
        .then(() => true)
        .catch(() => false);
      expect(exists).toBe(true);
    }
  });

  it("adds 3 entries to queue.md Available section", async () => {
    const projectDir = await setupProject();
    await createWorkflow(projectDir, "WF-001");

    const result = await createTaskBatch({
      projectDir,
      workflowId: "WF-001",
      tasks: makeTestTasks(),
    });

    const queueContent = await fs.readFile(path.join(projectDir, "queue.md"), "utf-8");
    const parsed = parseQueue(queueContent, "queue.md");
    expect(parsed.available).toHaveLength(3);
    for (const taskId of result.taskIds) {
      expect(parsed.available.some((e) => e.taskId === taskId)).toBe(true);
    }
  });

  it("updates workflow frontmatter tasks[] with all 3 task IDs", async () => {
    const projectDir = await setupProject();
    await createWorkflow(projectDir, "WF-001");

    const result = await createTaskBatch({
      projectDir,
      workflowId: "WF-001",
      tasks: makeTestTasks(),
    });

    const wfContent = await fs.readFile(path.join(projectDir, "workflows", "WF-001.md"), "utf-8");
    const wfParsed = parseWorkflowFrontmatter(wfContent, "WF-001.md");
    expect(wfParsed.success).toBe(true);
    if (wfParsed.success) {
      for (const taskId of result.taskIds) {
        expect(wfParsed.data.tasks).toContain(taskId);
      }
    }
  });

  it("task IDs are sequential (TASK-001, TASK-002, TASK-003 in empty project)", async () => {
    const projectDir = await setupProject();
    await createWorkflow(projectDir, "WF-001");

    const result = await createTaskBatch({
      projectDir,
      workflowId: "WF-001",
      tasks: makeTestTasks(),
    });

    expect(result.taskIds).toEqual(["TASK-001", "TASK-002", "TASK-003"]);
  });

  it("task file content contains all 5 DEC-02 body sections", async () => {
    const projectDir = await setupProject();
    await createWorkflow(projectDir, "WF-001");

    await createTaskBatch({
      projectDir,
      workflowId: "WF-001",
      tasks: makeTestTasks(),
    });

    const content = await fs.readFile(path.join(projectDir, "tasks", "TASK-001.md"), "utf-8");
    expect(content).toContain("## Objective");
    expect(content).toContain("## Context");
    expect(content).toContain("## Action Guidance");
    expect(content).toContain("## Success Criteria");
    expect(content).toContain("## Verification");
  });

  it("if queue addTasks fails, previously created task files are deleted (rollback)", async () => {
    const projectDir = await setupProject();
    await createWorkflow(projectDir, "WF-001");

    // Remove queue.md so addTasks fails when trying to read it
    await fs.unlink(path.join(projectDir, "queue.md"));

    await expect(
      createTaskBatch({
        projectDir,
        workflowId: "WF-001",
        tasks: makeTestTasks(),
      }),
    ).rejects.toThrow();

    // Verify task files were cleaned up
    const entries = await fs.readdir(path.join(projectDir, "tasks"));
    const taskFiles = entries.filter((e) => e.startsWith("TASK-"));
    expect(taskFiles).toHaveLength(0);
  });

  it("returns { taskIds, rollback } with correct IDs", async () => {
    const projectDir = await setupProject();
    await createWorkflow(projectDir, "WF-001");

    const result = await createTaskBatch({
      projectDir,
      workflowId: "WF-001",
      tasks: makeTestTasks(),
    });

    expect(result.taskIds).toBeDefined();
    expect(result.rollback).toBeTypeOf("function");
    expect(result.taskIds).toHaveLength(3);
  });

  it("calling rollback deletes all created task files", async () => {
    const projectDir = await setupProject();
    await createWorkflow(projectDir, "WF-001");

    const result = await createTaskBatch({
      projectDir,
      workflowId: "WF-001",
      tasks: makeTestTasks(),
    });

    // Verify files exist before rollback
    for (const taskId of result.taskIds) {
      const exists = await fs
        .access(path.join(projectDir, "tasks", `${taskId}.md`))
        .then(() => true)
        .catch(() => false);
      expect(exists).toBe(true);
    }

    await result.rollback();

    // Verify files removed after rollback
    for (const taskId of result.taskIds) {
      const exists = await fs
        .access(path.join(projectDir, "tasks", `${taskId}.md`))
        .then(() => true)
        .catch(() => false);
      expect(exists).toBe(false);
    }
  });

  it("if updateWorkflowTasks fails after queue entries written, task files are cleaned up (orphan case)", async () => {
    const projectDir = await setupProject();
    await createWorkflow(projectDir, "WF-001");

    // Remove the workflow file entirely so updateWorkflowTasks fails on read.
    // Queue addTasks will succeed first (queue.md exists), then the workflow
    // update will throw ENOENT.
    await fs.unlink(path.join(projectDir, "workflows", "WF-001.md"));

    await expect(
      createTaskBatch({
        projectDir,
        workflowId: "WF-001",
        tasks: makeTestTasks(),
      }),
    ).rejects.toThrow();

    // Verify task files were cleaned up (deleted by the catch block)
    const entries = await fs.readdir(path.join(projectDir, "tasks"));
    const taskFiles = entries.filter((e) => e.startsWith("TASK-"));
    expect(taskFiles).toHaveLength(0);

    // Orphaned queue entries are accepted; heartbeat scanner still finds valid task files via queue entries.
    // Queue entries remain because addTasks succeeded before the workflow update failed.
    // This is documented as accepted behavior since:
    // (a) the queue entries still reference valid task IDs,
    // (b) the caller (orchestrateGoal) can re-run updateWorkflowTasks to fix.
    const queueContent = await fs.readFile(path.join(projectDir, "queue.md"), "utf-8");
    const queueParsed = parseQueue(queueContent, "queue.md");
    // Queue entries should still be present (orphaned)
    expect(queueParsed.available.length).toBeGreaterThan(0);
  });

  it("remaps batch-local depends_on to real task IDs", async () => {
    const projectDir = await setupProject();
    await createWorkflow(projectDir, "WF-001");

    const result = await createTaskBatch({
      projectDir,
      workflowId: "WF-001",
      tasks: makeTestTasks(),
    });

    // Second task depends on first, third depends on second
    const task2Content = await fs.readFile(path.join(projectDir, "tasks", "TASK-002.md"), "utf-8");
    expect(task2Content).toContain("TASK-001");
    // Should not contain the batch-local ID
    expect(task2Content).not.toContain("batch-1");
  });
});

describe("orchestrateGoal", () => {
  let tmpDir: string;

  async function setupProject(): Promise<string> {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "orch-goal-"));
    const projectDir = tmpDir;
    await fs.mkdir(path.join(projectDir, "tasks"), { recursive: true });
    await fs.mkdir(path.join(projectDir, "workflows"), { recursive: true });
    await fs.writeFile(
      path.join(projectDir, "PROJECT.md"),
      generateProjectMd({ name: "test-project" }),
      "utf-8",
    );
    await fs.writeFile(path.join(projectDir, "queue.md"), generateQueueMd(), "utf-8");
    return projectDir;
  }

  afterEach(async () => {
    if (tmpDir) {
      await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    }
  });

  it("creates workflow file, task files, and queue entries", async () => {
    const projectDir = await setupProject();
    const tasks: DecomposedTask[] = [
      makeTask({ id: "batch-1", title: "First task" }),
      makeTask({ id: "batch-2", title: "Second task", depends_on: ["batch-1"] }),
    ];

    const result = await orchestrateGoal({
      projectDir,
      goal: "Build the feature",
      goalTitle: "Feature Build",
      tasks,
      agentCapabilities: new Map(),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // Workflow file exists
    const wfPath = path.join(projectDir, "workflows", `${result.workflowId}.md`);
    const wfContent = await fs.readFile(wfPath, "utf-8");
    expect(wfContent).toContain("Build the feature");

    // Workflow is active (not draft)
    const wfParsed = parseWorkflowFrontmatter(wfContent, wfPath);
    expect(wfParsed.success).toBe(true);
    if (wfParsed.success) {
      expect(wfParsed.data.status).toBe("active");
      expect(wfParsed.data.tasks).toHaveLength(2);
    }

    // Task files exist
    expect(result.taskIds).toHaveLength(2);
    for (const taskId of result.taskIds) {
      const exists = await fs
        .access(path.join(projectDir, "tasks", `${taskId}.md`))
        .then(() => true)
        .catch(() => false);
      expect(exists).toBe(true);
    }

    // Queue entries exist
    const queueContent = await fs.readFile(path.join(projectDir, "queue.md"), "utf-8");
    const queueParsed = parseQueue(queueContent, "queue.md");
    expect(queueParsed.available).toHaveLength(2);
  });

  it("with circular deps returns error without creating any files", async () => {
    const projectDir = await setupProject();
    const tasks: DecomposedTask[] = [
      makeTask({ id: "batch-1", depends_on: ["batch-2"] }),
      makeTask({ id: "batch-2", depends_on: ["batch-1"] }),
    ];

    const result = await orchestrateGoal({
      projectDir,
      goal: "Circular goal",
      goalTitle: "Circular",
      tasks,
      agentCapabilities: new Map(),
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.includes("Circular dependency"))).toBe(true);
    }

    // No workflow files created
    const wfEntries = await fs.readdir(path.join(projectDir, "workflows"));
    const wfFiles = wfEntries.filter((e) => e.endsWith(".md"));
    expect(wfFiles).toHaveLength(0);
  });

  it("with unmatched capability returns error listing the capability", async () => {
    const projectDir = await setupProject();
    // Write PROJECT.md with restricted capabilities
    const projectContent = generateProjectMd({ name: "test-project" });
    const updatedProject = projectContent.replace(
      "allowed_capabilities: []",
      "allowed_capabilities:\n  - code\n  - research",
    );
    await fs.writeFile(path.join(projectDir, "PROJECT.md"), updatedProject, "utf-8");

    const tasks: DecomposedTask[] = [makeTask({ id: "batch-1", capabilities: ["exotic-cap"] })];

    const result = await orchestrateGoal({
      projectDir,
      goal: "Cap test",
      goalTitle: "Capabilities",
      tasks,
      agentCapabilities: new Map([["agent-a", ["code"]]]),
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.includes("exotic-cap"))).toBe(true);
    }
  });
});

describe("parseOrchestratorPayload", () => {
  const validPayload = {
    type: "orchestrate",
    goal: "Build a feature",
    goalTitle: "Feature Build",
    project: "my-project",
    projectDir: "/tmp/projects/my-project",
  };

  it("valid JSON returns { ok: true } with all fields", () => {
    const result = parseOrchestratorPayload(JSON.stringify(validPayload));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.payload.goal).toBe("Build a feature");
      expect(result.payload.goalTitle).toBe("Feature Build");
      expect(result.payload.project).toBe("my-project");
      expect(result.payload.projectDir).toBe("/tmp/projects/my-project");
      expect(result.payload.type).toBe("orchestrate");
    }
  });

  it("missing goal field returns { ok: false }", () => {
    const payload = { ...validPayload, goal: undefined };
    const result = parseOrchestratorPayload(JSON.stringify(payload));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("goal");
    }
  });

  it("non-JSON string returns { ok: false }", () => {
    const result = parseOrchestratorPayload("not json at all");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("JSON");
    }
  });

  it("unknown type field returns { ok: false }", () => {
    const payload = { ...validPayload, type: "unknown-type" };
    const result = parseOrchestratorPayload(JSON.stringify(payload));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("type");
    }
  });

  it("constraints with maxTasks and preferredCapabilities are preserved", () => {
    const payload = {
      ...validPayload,
      constraints: {
        maxTasks: 10,
        preferredCapabilities: ["code", "research"],
        sideEffectPolicy: "ask-irreversible",
      },
    };
    const result = parseOrchestratorPayload(JSON.stringify(payload));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.payload.constraints?.maxTasks).toBe(10);
      expect(result.payload.constraints?.preferredCapabilities).toEqual(["code", "research"]);
      expect(result.payload.constraints?.sideEffectPolicy).toBe("ask-irreversible");
    }
  });

  it("empty constraints object is fine", () => {
    const payload = { ...validPayload, constraints: {} };
    const result = parseOrchestratorPayload(JSON.stringify(payload));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.payload.constraints).toEqual({});
    }
  });
});
