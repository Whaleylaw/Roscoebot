import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProjectManager } from "../projects/scaffold.js";
import type { OutputRuntimeEnv } from "../runtime.js";
import { projectsStatusCommand } from "./projects.status.js";

function makeRuntime(overrides?: Partial<OutputRuntimeEnv>): OutputRuntimeEnv {
  return {
    log: vi.fn(),
    error: vi.fn(),
    exit: vi.fn(),
    writeStdout: vi.fn(),
    writeJson: vi.fn(),
    ...overrides,
  };
}

/** Helper to write a valid task file with frontmatter. */
async function writeTask(
  projectDir: string,
  id: string,
  extra: Record<string, string> = {},
): Promise<void> {
  const fields: Record<string, string> = {
    id,
    title: `Task ${id}`,
    status: "backlog",
    column: "Backlog",
    priority: "medium",
    ...extra,
  };
  const yaml = Object.entries(fields)
    .map(([k, v]) => `${k}: ${v}`)
    .join("\n");
  const content = `---\n${yaml}\n---\n\n# ${fields.title}\n`;
  await fs.writeFile(path.join(projectDir, "tasks", `${id}.md`), content, "utf-8");
}

/** Helper to write a queue.md with claimed entries. */
async function writeQueue(
  projectDir: string,
  claimed: Array<{ taskId: string; agent: string }> = [],
): Promise<void> {
  const claimedLines = claimed.map((c) => `- ${c.taskId} [agent: ${c.agent}]`).join("\n");
  const content = `---\nupdated: "2026-01-01"\n---\n\n## Available\n\n## Claimed\n${claimedLines}\n\n## Done\n\n## Blocked\n`;
  await fs.writeFile(path.join(projectDir, "queue.md"), content, "utf-8");
}

describe("projectsStatusCommand", () => {
  let tmpDir: string;
  let homeDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "oc-status-test-"));
    homeDir = tmpDir;
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("prints header with project name and status", async () => {
    const manager = new ProjectManager(homeDir);
    const projectDir = await manager.create({ name: "alpha", description: "Test project" });
    await writeTask(projectDir, "TASK-001", { status: "backlog" });

    const runtime = makeRuntime();
    await projectsStatusCommand({ name: "alpha" }, { homeDir }, runtime);

    const output = vi
      .mocked(runtime.log)
      .mock.calls.map((c) => String(c[0]))
      .join("\n");
    expect(output).toContain("alpha");
    expect(output).toContain("active");
  });

  it("shows task counts grouped by status", async () => {
    const manager = new ProjectManager(homeDir);
    const projectDir = await manager.create({ name: "beta" });
    await writeTask(projectDir, "TASK-001", { status: "backlog" });
    await writeTask(projectDir, "TASK-002", { status: "backlog" });
    await writeTask(projectDir, "TASK-003", { status: "in-progress", column: "In Progress" });
    await writeTask(projectDir, "TASK-004", { status: "done", column: "Done" });
    await writeTask(projectDir, "TASK-005", { status: "done", column: "Done" });

    const runtime = makeRuntime();
    await projectsStatusCommand({ name: "beta" }, { homeDir }, runtime);

    const output = vi
      .mocked(runtime.log)
      .mock.calls.map((c) => String(c[0]))
      .join("\n");
    expect(output).toContain("backlog");
    expect(output).toContain("2");
    expect(output).toContain("in-progress");
    expect(output).toContain("1");
    expect(output).toContain("done");
  });

  it("shows active agents table when queue has claimed tasks", async () => {
    const manager = new ProjectManager(homeDir);
    const projectDir = await manager.create({ name: "gamma" });
    await writeTask(projectDir, "TASK-001", { status: "in-progress", column: "In Progress" });
    await writeQueue(projectDir, [{ taskId: "TASK-001", agent: "agent-42" }]);

    const runtime = makeRuntime();
    await projectsStatusCommand({ name: "gamma" }, { homeDir }, runtime);

    const output = vi
      .mocked(runtime.log)
      .mock.calls.map((c) => String(c[0]))
      .join("\n");
    expect(output).toContain("agent-42");
    expect(output).toContain("TASK-001");
  });

  it("omits Active Agents section when no claimed tasks", async () => {
    const manager = new ProjectManager(homeDir);
    const projectDir = await manager.create({ name: "delta" });
    await writeTask(projectDir, "TASK-001", { status: "backlog" });

    const runtime = makeRuntime();
    await projectsStatusCommand({ name: "delta" }, { homeDir }, runtime);

    const output = vi
      .mocked(runtime.log)
      .mock.calls.map((c) => String(c[0]))
      .join("\n");
    expect(output).not.toContain("Active Agents");
  });

  it("outputs structured JSON with --json flag", async () => {
    const manager = new ProjectManager(homeDir);
    const projectDir = await manager.create({ name: "epsilon" });
    await writeTask(projectDir, "TASK-001", { status: "backlog" });
    await writeTask(projectDir, "TASK-002", { status: "done", column: "Done" });
    await writeQueue(projectDir, [{ taskId: "TASK-003", agent: "agent-7" }]);

    const runtime = makeRuntime();
    await projectsStatusCommand({ name: "epsilon", json: true }, { homeDir }, runtime);

    expect(runtime.writeJson).toHaveBeenCalled();
    const jsonArg = vi.mocked(runtime.writeJson).mock.calls[0]?.[0] as {
      name: string;
      status: string;
      taskCounts: Record<string, number>;
      activeAgents: Array<{ agent: string; taskId: string }>;
    };
    expect(jsonArg.name).toBe("epsilon");
    expect(jsonArg.status).toBe("active");
    expect(jsonArg.taskCounts).toEqual({ backlog: 1, done: 1 });
    expect(jsonArg.activeAgents).toEqual([{ agent: "agent-7", taskId: "TASK-003" }]);
  });

  it("prints error and lists available projects for nonexistent project", async () => {
    const manager = new ProjectManager(homeDir);
    await manager.create({ name: "real-project" });

    const runtime = makeRuntime();
    await projectsStatusCommand({ name: "ghost" }, { homeDir }, runtime);

    const errorOutput = vi
      .mocked(runtime.error)
      .mock.calls.map((c) => String(c[0]))
      .join("\n");
    expect(errorOutput).toContain("Project not found: ghost");
    expect(errorOutput).toContain("real-project");
  });

  it("exits with code 1 for nonexistent project", async () => {
    const runtime = makeRuntime();
    await projectsStatusCommand({ name: "ghost" }, { homeDir }, runtime);

    expect(runtime.exit).toHaveBeenCalledWith(1);
  });

  describe("workflow status output", () => {
    /** Helper to write a workflow file in workflows/ directory. */
    async function writeWorkflow(
      projectDir: string,
      id: string,
      fields: { title: string; status: string; goal: string; tasks: string[] },
    ): Promise<void> {
      const tasksYaml = fields.tasks.map((t) => `  - ${t}`).join("\n");
      const content = `---
id: ${id}
title: "${fields.title}"
status: ${fields.status}
goal: "${fields.goal}"
tasks:
${tasksYaml}
---

# ${fields.title}
`;
      const wfDir = path.join(projectDir, "workflows");
      await fs.mkdir(wfDir, { recursive: true });
      await fs.writeFile(path.join(wfDir, `${id}.md`), content, "utf-8");
    }

    it("shows Workflows section with active workflows in text output", async () => {
      const manager = new ProjectManager(homeDir);
      const projectDir = await manager.create({ name: "wf-text" });
      await writeTask(projectDir, "TASK-001", { status: "done", column: "Done" });
      await writeTask(projectDir, "TASK-002", { status: "in-progress", column: "In Progress" });
      await writeTask(projectDir, "TASK-003", { status: "backlog" });
      await writeWorkflow(projectDir, "WF-001", {
        title: "Deploy pipeline",
        status: "active",
        goal: "Ship it",
        tasks: ["TASK-001", "TASK-002", "TASK-003"],
      });

      const runtime = makeRuntime();
      await projectsStatusCommand({ name: "wf-text" }, { homeDir }, runtime);

      const output = vi
        .mocked(runtime.log)
        .mock.calls.map((c) => String(c[0]))
        .join("\n");
      expect(output).toContain("Workflows:");
      expect(output).toContain("WF-001");
      expect(output).toContain("Deploy pipeline");
      expect(output).toContain("active");
      // Progress should show 1/3 (1 done out of 3)
      expect(output).toContain("1/3");
    });

    it("shows workflow table columns: Workflow, Title, Status, Progress, Blocked", async () => {
      const manager = new ProjectManager(homeDir);
      const projectDir = await manager.create({ name: "wf-cols" });
      await writeTask(projectDir, "TASK-001", { status: "done", column: "Done" });
      await writeWorkflow(projectDir, "WF-001", {
        title: "Test WF",
        status: "active",
        goal: "Test",
        tasks: ["TASK-001"],
      });

      const runtime = makeRuntime();
      await projectsStatusCommand({ name: "wf-cols" }, { homeDir }, runtime);

      const output = vi
        .mocked(runtime.log)
        .mock.calls.map((c) => String(c[0]))
        .join("\n");
      expect(output).toContain("Workflow");
      expect(output).toContain("Title");
      expect(output).toContain("Status");
      expect(output).toContain("Progress");
      expect(output).toContain("Blocked");
    });

    it("filters out completed and failed workflows from text output", async () => {
      const manager = new ProjectManager(homeDir);
      const projectDir = await manager.create({ name: "wf-filter" });
      await writeTask(projectDir, "TASK-001", { status: "done", column: "Done" });
      await writeTask(projectDir, "TASK-002", { status: "done", column: "Done" });
      await writeWorkflow(projectDir, "WF-001", {
        title: "Done workflow",
        status: "completed",
        goal: "Already done",
        tasks: ["TASK-001"],
      });
      await writeWorkflow(projectDir, "WF-002", {
        title: "Failed workflow",
        status: "failed",
        goal: "It broke",
        tasks: ["TASK-002"],
      });

      const runtime = makeRuntime();
      await projectsStatusCommand({ name: "wf-filter" }, { homeDir }, runtime);

      const output = vi
        .mocked(runtime.log)
        .mock.calls.map((c) => String(c[0]))
        .join("\n");
      expect(output).toContain("No active workflows");
      expect(output).not.toContain("Done workflow");
      expect(output).not.toContain("Failed workflow");
    });

    it("shows nothing extra when no workflows/ directory exists", async () => {
      const manager = new ProjectManager(homeDir);
      await manager.create({ name: "wf-none" });

      const runtime = makeRuntime();
      await projectsStatusCommand({ name: "wf-none" }, { homeDir }, runtime);

      const output = vi
        .mocked(runtime.log)
        .mock.calls.map((c) => String(c[0]))
        .join("\n");
      // Should not contain Workflows section when dir doesn't exist
      expect(output).not.toContain("Workflows:");
    });

    it("includes all workflows in JSON output including completed/failed", async () => {
      const manager = new ProjectManager(homeDir);
      const projectDir = await manager.create({ name: "wf-json" });
      await writeTask(projectDir, "TASK-001", { status: "done", column: "Done" });
      await writeTask(projectDir, "TASK-002", { status: "in-progress", column: "In Progress" });
      await writeTask(projectDir, "TASK-003", { status: "blocked", column: "Blocked" });
      await writeWorkflow(projectDir, "WF-001", {
        title: "Active one",
        status: "active",
        goal: "Do things",
        tasks: ["TASK-001", "TASK-002"],
      });
      await writeWorkflow(projectDir, "WF-002", {
        title: "Done one",
        status: "completed",
        goal: "Did things",
        tasks: ["TASK-003"],
      });

      const runtime = makeRuntime();
      await projectsStatusCommand({ name: "wf-json", json: true }, { homeDir }, runtime);

      expect(runtime.writeJson).toHaveBeenCalled();
      const jsonArg = vi.mocked(runtime.writeJson).mock.calls[0]?.[0] as {
        workflows: Array<{
          id: string;
          title: string;
          status: string;
          goal: string;
          tasks: Record<string, string>;
          progress: { total: number; done: number; claimed: number; review: number; blocked: number; available: number };
        }>;
      };
      expect(jsonArg.workflows).toHaveLength(2);

      const wf1 = jsonArg.workflows.find((w) => w.id === "WF-001");
      expect(wf1).toBeDefined();
      expect(wf1!.title).toBe("Active one");
      expect(wf1!.status).toBe("active");
      expect(wf1!.tasks).toEqual({ "TASK-001": "done", "TASK-002": "in-progress" });
      expect(wf1!.progress).toEqual({ total: 2, done: 1, claimed: 1, review: 0, blocked: 0, available: 0 });

      const wf2 = jsonArg.workflows.find((w) => w.id === "WF-002");
      expect(wf2).toBeDefined();
      expect(wf2!.status).toBe("completed");
      expect(wf2!.progress.blocked).toBe(1);
    });

    it("shows paused workflows in text output", async () => {
      const manager = new ProjectManager(homeDir);
      const projectDir = await manager.create({ name: "wf-paused" });
      await writeTask(projectDir, "TASK-001", { status: "backlog" });
      await writeWorkflow(projectDir, "WF-001", {
        title: "Paused WF",
        status: "paused",
        goal: "Waiting",
        tasks: ["TASK-001"],
      });

      const runtime = makeRuntime();
      await projectsStatusCommand({ name: "wf-paused" }, { homeDir }, runtime);

      const output = vi
        .mocked(runtime.log)
        .mock.calls.map((c) => String(c[0]))
        .join("\n");
      expect(output).toContain("Workflows:");
      expect(output).toContain("WF-001");
      expect(output).toContain("paused");
    });
  });
});
