import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import YAML from "yaml";
import { scanAndClaimTask } from "./heartbeat-scanner.js";

/**
 * Helper to create a temp project directory with queue.md and task files.
 */
async function setupProjectDir(opts: {
  availableTasks?: Array<{
    id: string;
    title?: string;
    priority?: string;
    capabilities?: string[];
    depends_on?: string[];
    status?: string;
  }>;
  claimedTasks?: Array<{ id: string; agent?: string }>;
  doneTasks?: Array<{ id: string }>;
  /** Write checkpoint files for resume tests */
  checkpoints?: Array<{
    taskId: string;
    claimed_by: string;
    status: string;
    content?: string;
  }>;
  /** Write raw checkpoint content (for corrupted checkpoint test) */
  rawCheckpoints?: Array<{ taskId: string; content: string }>;
}): Promise<string> {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "hb-scanner-test-"));
  const tasksDir = path.join(tmpDir, "tasks");
  await fs.mkdir(tasksDir, { recursive: true });

  const available = opts.availableTasks ?? [];
  const claimed = opts.claimedTasks ?? [];
  const done = opts.doneTasks ?? [];

  // Build queue.md
  let queue = `---\nupdated: "2026-03-27"\n---\n\n## Available\n\n`;
  for (const t of available) {
    const meta: string[] = [];
    if (t.priority) {
      meta.push(`priority: ${t.priority}`);
    }
    if (t.capabilities?.length) {
      meta.push(`capabilities: ${t.capabilities.join(", ")}`);
    }
    const metaStr = meta.length ? ` [${meta.join(", ")}]` : "";
    queue += `- ${t.id}${metaStr}\n`;
  }
  queue += `\n## Claimed\n\n`;
  for (const t of claimed) {
    const metaStr = t.agent ? ` [agent: ${t.agent}]` : "";
    queue += `- ${t.id}${metaStr}\n`;
  }
  queue += `\n## Done\n\n`;
  for (const t of done) {
    queue += `- ${t.id}\n`;
  }
  queue += `\n## Blocked\n`;

  await fs.writeFile(path.join(tmpDir, "queue.md"), queue, "utf8");

  // Write task files
  const allTasks = [
    ...available.map((t) => ({
      id: t.id,
      title: t.title ?? `Task ${t.id}`,
      status: t.status ?? "backlog",
      priority: t.priority ?? "medium",
      capabilities: t.capabilities ?? [],
      depends_on: t.depends_on ?? [],
    })),
    ...claimed.map((t) => ({
      id: t.id,
      title: `Task ${t.id}`,
      status: "in-progress",
      priority: "medium",
      capabilities: [] as string[],
      depends_on: [] as string[],
    })),
    ...done.map((t) => ({
      id: t.id,
      title: `Task ${t.id}`,
      status: "done",
      priority: "medium",
      capabilities: [] as string[],
      depends_on: [] as string[],
    })),
  ];

  for (const t of allTasks) {
    const frontmatter = {
      id: t.id,
      title: t.title,
      status: t.status,
      priority: t.priority,
      capabilities: t.capabilities,
      depends_on: t.depends_on,
      claimed_by: null,
      claimed_at: null,
    };
    const yamlStr = YAML.stringify(frontmatter, { schema: "core" });
    const content = `---\n${yamlStr}---\n\n# ${t.title}\n\nTask description for ${t.id}.\n`;
    await fs.writeFile(path.join(tasksDir, `${t.id}.md`), content, "utf8");
  }

  // Write checkpoint files
  for (const cp of opts.checkpoints ?? []) {
    const data = {
      status: cp.status,
      claimed_by: cp.claimed_by,
      claimed_at: "2026-03-27T10:00:00Z",
      last_step: "Initial claim",
      next_action: "Start work",
      progress_pct: 0,
      files_modified: [],
      failed_approaches: [],
      log: [
        {
          timestamp: "2026-03-27T10:00:00Z",
          agent: cp.claimed_by,
          action: "Claimed task",
        },
      ],
      notes: "",
    };
    await fs.writeFile(
      path.join(tasksDir, `${cp.taskId}.checkpoint.json`),
      JSON.stringify(data, null, 2),
      "utf8",
    );
    // Also ensure a matching task file exists
    const taskPath = path.join(tasksDir, `${cp.taskId}.md`);
    try {
      await fs.access(taskPath);
    } catch {
      const fm = {
        id: cp.taskId,
        title: `Task ${cp.taskId}`,
        status: cp.status,
        priority: "medium",
        capabilities: [],
        depends_on: [],
        claimed_by: cp.claimed_by,
        claimed_at: "2026-03-27T10:00:00Z",
      };
      const yamlStr = YAML.stringify(fm, { schema: "core" });
      const content = `---\n${yamlStr}---\n\n# Task ${cp.taskId}\n\n${cp.content ?? "Resumed task."}\n`;
      await fs.writeFile(taskPath, content, "utf8");
    }
  }

  // Write raw (possibly corrupted) checkpoints
  for (const raw of opts.rawCheckpoints ?? []) {
    await fs.writeFile(path.join(tasksDir, `${raw.taskId}.checkpoint.json`), raw.content, "utf8");
  }

  return tmpDir;
}

describe("heartbeat-scanner", () => {
  let tmpDirs: string[] = [];

  beforeEach(() => {
    tmpDirs = [];
  });

  afterEach(async () => {
    for (const dir of tmpDirs) {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  async function setup(opts: Parameters<typeof setupProjectDir>[0] = {}): Promise<string> {
    const dir = await setupProjectDir(opts);
    tmpDirs.push(dir);
    return dir;
  }

  // Test 1: idle when no Available entries
  it("returns idle when queue has no Available entries", async () => {
    const dir = await setup({ availableTasks: [] });
    const result = await scanAndClaimTask({
      agentId: "agent-1",
      agentCapabilities: ["code"],
      projectDir: dir,
    });
    expect(result.type).toBe("idle");
  });

  // Test 2: idle when no project directory configured
  it("returns idle when no project directory configured", async () => {
    const result = await scanAndClaimTask({
      agentId: "agent-1",
      agentCapabilities: ["code"],
      projectDir: "/nonexistent/path/that/does/not/exist",
    });
    expect(result.type).toBe("idle");
  });

  // Test 3: claimed with correct task when single Available task matches
  it("returns claimed with correct task for matching Available task", async () => {
    const dir = await setup({
      availableTasks: [
        {
          id: "TASK-001",
          title: "Fix bug",
          priority: "high",
          capabilities: ["code"],
        },
      ],
    });
    const result = await scanAndClaimTask({
      agentId: "agent-1",
      agentCapabilities: ["code"],
      projectDir: dir,
    });
    expect(result.type).toBe("claimed");
    if (result.type === "claimed") {
      expect(result.task.id).toBe("TASK-001");
      expect(result.task.content).toContain("Fix bug");
    }
  });

  // Test 4: claimTask is called with taskId and agentId
  it("calls QueueManager.claimTask with taskId and agentId on successful claim", async () => {
    const dir = await setup({
      availableTasks: [{ id: "TASK-001", title: "Work", capabilities: [] }],
    });
    const result = await scanAndClaimTask({
      agentId: "agent-42",
      agentCapabilities: [],
      projectDir: dir,
    });
    expect(result.type).toBe("claimed");
    // Verify the task moved to Claimed in queue.md
    const queueContent = await fs.readFile(path.join(dir, "queue.md"), "utf8");
    expect(queueContent).toContain("agent-42");
    // Task should no longer be in Available
    const availableSection = queueContent.split("## Claimed")[0];
    expect(availableSection).not.toContain("TASK-001");
  });

  // Test 5: skips tasks where agent capabilities do not match
  it("skips tasks where agent capabilities do not match", async () => {
    const dir = await setup({
      availableTasks: [
        {
          id: "TASK-001",
          title: "UI task",
          capabilities: ["ui", "design"],
          priority: "high",
        },
      ],
    });
    const result = await scanAndClaimTask({
      agentId: "agent-1",
      agentCapabilities: ["code", "testing"],
      projectDir: dir,
    });
    expect(result.type).toBe("idle");
  });

  // Test 6: skips tasks with unmet dependencies
  it("skips tasks with depends_on where any dependency is not done", async () => {
    const dir = await setup({
      availableTasks: [
        {
          id: "TASK-002",
          title: "Blocked task",
          capabilities: [],
          depends_on: ["TASK-001"],
        },
      ],
    });
    // TASK-001 doesn't exist (or is not done) -- should skip
    const result = await scanAndClaimTask({
      agentId: "agent-1",
      agentCapabilities: [],
      projectDir: dir,
    });
    expect(result.type).toBe("idle");
  });

  // Test 7: claims task when ALL dependencies are done
  it("claims task when ALL depends_on tasks have status done", async () => {
    const dir = await setup({
      availableTasks: [
        {
          id: "TASK-003",
          title: "Ready task",
          capabilities: [],
          depends_on: ["TASK-001", "TASK-002"],
        },
      ],
      doneTasks: [{ id: "TASK-001" }, { id: "TASK-002" }],
    });
    const result = await scanAndClaimTask({
      agentId: "agent-1",
      agentCapabilities: [],
      projectDir: dir,
    });
    expect(result.type).toBe("claimed");
    if (result.type === "claimed") {
      expect(result.task.id).toBe("TASK-003");
    }
  });

  // Test 8: selects highest priority task
  it("selects highest priority task: critical > high > medium > low", async () => {
    const dir = await setup({
      availableTasks: [
        { id: "TASK-001", title: "Low", priority: "low", capabilities: [] },
        { id: "TASK-002", title: "Critical", priority: "critical", capabilities: [] },
        { id: "TASK-003", title: "High", priority: "high", capabilities: [] },
        { id: "TASK-004", title: "Medium", priority: "medium", capabilities: [] },
      ],
    });
    const result = await scanAndClaimTask({
      agentId: "agent-1",
      agentCapabilities: [],
      projectDir: dir,
    });
    expect(result.type).toBe("claimed");
    if (result.type === "claimed") {
      expect(result.task.id).toBe("TASK-002");
    }
  });

  // Test 9: ties broken by queue position
  it("breaks priority ties by queue position (first listed wins)", async () => {
    const dir = await setup({
      availableTasks: [
        { id: "TASK-001", title: "First high", priority: "high", capabilities: [] },
        { id: "TASK-002", title: "Second high", priority: "high", capabilities: [] },
        { id: "TASK-003", title: "Third high", priority: "high", capabilities: [] },
      ],
    });
    const result = await scanAndClaimTask({
      agentId: "agent-1",
      agentCapabilities: [],
      projectDir: dir,
    });
    expect(result.type).toBe("claimed");
    if (result.type === "claimed") {
      expect(result.task.id).toBe("TASK-001");
    }
  });

  // Test 10: returns resumed when active checkpoint exists
  it("returns resumed when active checkpoint exists for agent", async () => {
    const dir = await setup({
      checkpoints: [
        {
          taskId: "TASK-005",
          claimed_by: "agent-1",
          status: "in-progress",
          content: "Active task content",
        },
      ],
    });
    const result = await scanAndClaimTask({
      agentId: "agent-1",
      agentCapabilities: [],
      projectDir: dir,
    });
    expect(result.type).toBe("resumed");
    if (result.type === "resumed") {
      expect(result.task.id).toBe("TASK-005");
      expect(result.checkpoint.claimed_by).toBe("agent-1");
      expect(result.checkpoint.status).toBe("in-progress");
    }
  });

  // Test 11: creates checkpoint.json sidecar on claim
  it("creates checkpoint.json sidecar on claim", async () => {
    const dir = await setup({
      availableTasks: [{ id: "TASK-001", title: "New task", capabilities: [] }],
    });
    const result = await scanAndClaimTask({
      agentId: "agent-1",
      agentCapabilities: [],
      projectDir: dir,
    });
    expect(result.type).toBe("claimed");
    const cpPath = path.join(dir, "tasks", "TASK-001.checkpoint.json");
    const cpContent = await fs.readFile(cpPath, "utf8");
    const cp = JSON.parse(cpContent);
    expect(cp.claimed_by).toBe("agent-1");
    expect(cp.status).toBe("in-progress");
    expect(cp.progress_pct).toBe(0);
  });

  // Test 12: returns task content (full markdown) in result
  it("returns task content (full markdown) in result", async () => {
    const dir = await setup({
      availableTasks: [{ id: "TASK-001", title: "Detailed task", capabilities: [] }],
    });
    const result = await scanAndClaimTask({
      agentId: "agent-1",
      agentCapabilities: [],
      projectDir: dir,
    });
    expect(result.type).toBe("claimed");
    if (result.type === "claimed") {
      expect(result.task.content).toContain("Detailed task");
      expect(result.task.content).toContain("Task description for TASK-001");
      expect(result.task.path).toContain("TASK-001.md");
    }
  });

  // Test 13: handles missing task files gracefully
  it("handles missing task files gracefully (skips entry, does not throw)", async () => {
    const dir = await setup({
      availableTasks: [{ id: "TASK-001", title: "Real task", capabilities: [] }],
    });
    // Remove the task file to simulate a missing file
    await fs.unlink(path.join(dir, "tasks", "TASK-001.md"));

    // Add a second task entry to queue.md that has no file
    // The scanner should skip the missing one and return idle
    const result = await scanAndClaimTask({
      agentId: "agent-1",
      agentCapabilities: [],
      projectDir: dir,
    });
    expect(result.type).toBe("idle");
  });

  // Test 14: handles corrupted checkpoint.json gracefully
  it("handles corrupted checkpoint.json gracefully (treats as no active task)", async () => {
    const dir = await setup({
      availableTasks: [{ id: "TASK-002", title: "Claimable", capabilities: [] }],
      rawCheckpoints: [{ taskId: "TASK-001", content: "THIS IS NOT VALID JSON {{{" }],
    });
    // Write a task file for TASK-001 so it looks like a real task
    const fm = {
      id: "TASK-001",
      title: "Corrupted checkpoint task",
      status: "in-progress",
      priority: "medium",
      capabilities: [],
      depends_on: [],
      claimed_by: "agent-1",
      claimed_at: "2026-03-27T10:00:00Z",
    };
    const yamlStr = YAML.stringify(fm, { schema: "core" });
    await fs.writeFile(
      path.join(dir, "tasks", "TASK-001.md"),
      `---\n${yamlStr}---\n\n# Corrupted\n`,
      "utf8",
    );

    const result = await scanAndClaimTask({
      agentId: "agent-1",
      agentCapabilities: [],
      projectDir: dir,
    });
    // Should not return "resumed" for corrupted checkpoint -- should claim TASK-002 instead
    expect(result.type).toBe("claimed");
    if (result.type === "claimed") {
      expect(result.task.id).toBe("TASK-002");
    }
  });
});

describe("budget gate", () => {
  let tmpDirs: string[] = [];

  beforeEach(() => {
    tmpDirs = [];
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    for (const dir of tmpDirs) {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  /** Helper: write a PROJECT.md with optional max_task_retries. */
  async function writeProjectMd(projectDir: string, maxRetries?: number): Promise<void> {
    const fm: Record<string, unknown> = { name: "test-project", status: "active" };
    if (maxRetries !== undefined) {
      fm.max_task_retries = maxRetries;
    }
    const yamlStr = YAML.stringify(fm, { schema: "core" });
    await fs.writeFile(path.join(projectDir, "PROJECT.md"), `---\n${yamlStr}---\n\n# Test\n`, "utf8");
  }

  /** Helper: write a checkpoint with recovery fields. */
  async function writeRecoveryCheckpoint(
    tasksDir: string,
    taskId: string,
    opts: {
      recovery_attempts: number;
      last_attempted_at: string | null;
      claimed_by?: string;
      status?: string;
    },
  ): Promise<void> {
    const cp = {
      status: opts.status ?? "in-progress",
      claimed_by: opts.claimed_by ?? "agent-prev",
      claimed_at: "2026-03-27T10:00:00Z",
      last_step: "",
      next_action: "",
      progress_pct: 0,
      files_modified: [],
      failed_approaches: [],
      log: [{ timestamp: "2026-03-27T10:00:00Z", agent: "agent-prev", action: "Claimed" }],
      notes: "",
      recovery_attempts: opts.recovery_attempts,
      last_attempted_at: opts.last_attempted_at,
      cumulative_tokens: 0,
      failure_category: "transient",
      failure_reason: "test failure",
    };
    await fs.writeFile(
      path.join(tasksDir, `${taskId}.checkpoint.json`),
      JSON.stringify(cp, null, 2),
      "utf8",
    );
  }

  async function setup(opts: Parameters<typeof setupProjectDir>[0] = {}): Promise<string> {
    const dir = await setupProjectDir(opts);
    tmpDirs.push(dir);
    return dir;
  }

  it("skips task when recovery_attempts >= max_task_retries (default 3) and escalates", async () => {
    const dir = await setup({
      availableTasks: [{ id: "TASK-001", title: "Budget exhausted", capabilities: [] }],
    });
    await writeProjectMd(dir);
    await writeRecoveryCheckpoint(path.join(dir, "tasks"), "TASK-001", {
      recovery_attempts: 3,
      last_attempted_at: "2026-03-27T09:00:00Z",
    });

    // Mock executeRecoveryStrategy to verify it is called for budget-exhausted tasks
    const recoveryMod = await import("./recovery-manager.js");
    const spy = vi.spyOn(recoveryMod, "executeRecoveryStrategy").mockResolvedValue({ outcome: "escalate" });

    const result = await scanAndClaimTask({
      agentId: "agent-1",
      agentCapabilities: [],
      projectDir: dir,
    });

    expect(result.type).toBe("idle");
    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({
        taskId: "TASK-001",
        failureCategory: "permanent",
        agentId: "heartbeat-scanner",
      }),
    );
  });

  it("skips task within backoff window", async () => {
    vi.useFakeTimers();
    const now = new Date("2026-03-27T10:00:00Z").getTime();
    vi.setSystemTime(now);

    const dir = await setup({
      availableTasks: [{ id: "TASK-001", title: "In backoff", capabilities: [] }],
    });
    await writeProjectMd(dir);
    // recovery_attempts=1, BACKOFF_MS[1]=25000ms, last_attempted_at 10 seconds ago -> still in window
    await writeRecoveryCheckpoint(path.join(dir, "tasks"), "TASK-001", {
      recovery_attempts: 1,
      last_attempted_at: new Date(now - 10_000).toISOString(),
    });

    const result = await scanAndClaimTask({
      agentId: "agent-1",
      agentCapabilities: [],
      projectDir: dir,
    });

    expect(result.type).toBe("idle");
  });

  it("includes task when recovery_attempts < max and backoff elapsed", async () => {
    vi.useFakeTimers();
    const now = new Date("2026-03-27T10:00:00Z").getTime();
    vi.setSystemTime(now);

    const dir = await setup({
      availableTasks: [{ id: "TASK-001", title: "Backoff elapsed", capabilities: [] }],
    });
    await writeProjectMd(dir);
    // recovery_attempts=1, BACKOFF_MS[1]=25000ms, last_attempted_at 30s ago -> past window
    await writeRecoveryCheckpoint(path.join(dir, "tasks"), "TASK-001", {
      recovery_attempts: 1,
      last_attempted_at: new Date(now - 30_000).toISOString(),
    });

    const result = await scanAndClaimTask({
      agentId: "agent-1",
      agentCapabilities: [],
      projectDir: dir,
    });

    expect(result.type).toBe("claimed");
  });

  it("includes task when no checkpoint exists (new task)", async () => {
    const dir = await setup({
      availableTasks: [{ id: "TASK-001", title: "Fresh task", capabilities: [] }],
    });
    await writeProjectMd(dir);
    // No checkpoint file

    const result = await scanAndClaimTask({
      agentId: "agent-1",
      agentCapabilities: [],
      projectDir: dir,
    });

    expect(result.type).toBe("claimed");
  });

  it("reads max_task_retries from PROJECT.md, falls back to DEFAULT_MAX_RETRIES", async () => {
    const dir = await setup({
      availableTasks: [{ id: "TASK-001", title: "Custom retries", capabilities: [] }],
    });
    // Set max_task_retries=1 in PROJECT.md
    await writeProjectMd(dir, 1);
    // Only 1 attempt, so with max_task_retries=1 it should be skipped
    await writeRecoveryCheckpoint(path.join(dir, "tasks"), "TASK-001", {
      recovery_attempts: 1,
      last_attempted_at: "2026-03-27T09:00:00Z",
    });

    const recoveryMod = await import("./recovery-manager.js");
    vi.spyOn(recoveryMod, "executeRecoveryStrategy").mockResolvedValue({ outcome: "escalate" });

    const result = await scanAndClaimTask({
      agentId: "agent-1",
      agentCapabilities: [],
      projectDir: dir,
    });

    expect(result.type).toBe("idle");
  });

  it("budget-exhausted task calls executeRecoveryStrategy with permanent category", async () => {
    const dir = await setup({
      availableTasks: [{ id: "TASK-001", title: "Exhausted", capabilities: [] }],
    });
    await writeProjectMd(dir);
    await writeRecoveryCheckpoint(path.join(dir, "tasks"), "TASK-001", {
      recovery_attempts: 5,
      last_attempted_at: "2026-03-27T09:00:00Z",
    });

    const recoveryMod = await import("./recovery-manager.js");
    const spy = vi.spyOn(recoveryMod, "executeRecoveryStrategy").mockResolvedValue({ outcome: "escalate" });

    await scanAndClaimTask({
      agentId: "agent-1",
      agentCapabilities: [],
      projectDir: dir,
    });

    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({
        taskId: "TASK-001",
        failureCategory: "permanent",
        failureReason: expect.stringContaining("Retry budget exhausted"),
        agentId: "heartbeat-scanner",
        projectDir: dir,
      }),
    );
  });
});

describe("stale claim detection", () => {
  let tmpDirs: string[] = [];

  beforeEach(() => {
    tmpDirs = [];
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    for (const dir of tmpDirs) {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  async function setup(opts: Parameters<typeof setupProjectDir>[0] = {}): Promise<string> {
    const dir = await setupProjectDir(opts);
    tmpDirs.push(dir);
    return dir;
  }

  it("STALE_CLAIM_THRESHOLD_MS is 30 minutes", async () => {
    const { STALE_CLAIM_THRESHOLD_MS } = await import("./heartbeat-scanner.js");
    expect(STALE_CLAIM_THRESHOLD_MS).toBe(30 * 60 * 1000);
  });

  it("detects stale claimed tasks and releases them to available", async () => {
    vi.useFakeTimers();
    const now = new Date("2026-03-27T12:00:00Z").getTime();
    vi.setSystemTime(now);

    const dir = await setup({
      claimedTasks: [{ id: "TASK-001", agent: "agent-stale" }],
    });

    // Write a checkpoint with last activity > 30 min ago
    const cpData = {
      status: "in-progress",
      claimed_by: "agent-stale",
      claimed_at: new Date(now - 40 * 60 * 1000).toISOString(),
      last_step: "",
      next_action: "",
      progress_pct: 0,
      files_modified: [],
      failed_approaches: [],
      log: [
        {
          timestamp: new Date(now - 35 * 60 * 1000).toISOString(),
          agent: "agent-stale",
          action: "Started work",
        },
      ],
      notes: "",
      recovery_attempts: 0,
      last_attempted_at: null,
      cumulative_tokens: 0,
      failure_category: null,
      failure_reason: null,
    };
    await fs.writeFile(
      path.join(dir, "tasks", "TASK-001.checkpoint.json"),
      JSON.stringify(cpData, null, 2),
      "utf8",
    );

    const { detectStaleClaims } = await import("./heartbeat-scanner.js");
    const result = await detectStaleClaims({ projectDir: dir });

    expect(result.releasedTasks).toContain("TASK-001");

    // Verify queue moved from claimed to available
    const queueContent = await fs.readFile(path.join(dir, "queue.md"), "utf8");
    const availableSection = queueContent.split("## Claimed")[0] ?? "";
    expect(availableSection).toContain("TASK-001");
  });

  it("skips tasks with recent checkpoint activity", async () => {
    vi.useFakeTimers();
    const now = new Date("2026-03-27T12:00:00Z").getTime();
    vi.setSystemTime(now);

    const dir = await setup({
      claimedTasks: [{ id: "TASK-001", agent: "agent-active" }],
    });

    // Recent activity -- 5 min ago
    const cpData = {
      status: "in-progress",
      claimed_by: "agent-active",
      claimed_at: new Date(now - 10 * 60 * 1000).toISOString(),
      last_step: "Working",
      next_action: "",
      progress_pct: 50,
      files_modified: [],
      failed_approaches: [],
      log: [
        {
          timestamp: new Date(now - 5 * 60 * 1000).toISOString(),
          agent: "agent-active",
          action: "Recent activity",
        },
      ],
      notes: "",
      recovery_attempts: 0,
      last_attempted_at: null,
      cumulative_tokens: 0,
      failure_category: null,
      failure_reason: null,
    };
    await fs.writeFile(
      path.join(dir, "tasks", "TASK-001.checkpoint.json"),
      JSON.stringify(cpData, null, 2),
      "utf8",
    );

    const { detectStaleClaims } = await import("./heartbeat-scanner.js");
    const result = await detectStaleClaims({ projectDir: dir });

    expect(result.releasedTasks).toHaveLength(0);
  });

  it("does nothing when no tasks are in claimed section", async () => {
    const dir = await setup({
      availableTasks: [{ id: "TASK-001", title: "Available", capabilities: [] }],
    });

    const { detectStaleClaims } = await import("./heartbeat-scanner.js");
    const result = await detectStaleClaims({ projectDir: dir });

    expect(result.releasedTasks).toHaveLength(0);
  });

  it("skips tasks with no checkpoint (just claimed, not yet started)", async () => {
    vi.useFakeTimers();
    const now = new Date("2026-03-27T12:00:00Z").getTime();
    vi.setSystemTime(now);

    const dir = await setup({
      claimedTasks: [{ id: "TASK-001", agent: "agent-new" }],
    });
    // No checkpoint file -- task was just claimed

    const { detectStaleClaims } = await import("./heartbeat-scanner.js");
    const result = await detectStaleClaims({ projectDir: dir });

    expect(result.releasedTasks).toHaveLength(0);
  });
});

describe("integration", () => {
  let tmpDirs: string[] = [];

  afterEach(async () => {
    for (const dir of tmpDirs) {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  async function setup(opts: Parameters<typeof setupProjectDir>[0] = {}): Promise<string> {
    const dir = await setupProjectDir(opts);
    tmpDirs.push(dir);
    return dir;
  }

  it("full claim flow: scan queue, claim task, create checkpoint, read checkpoint on resume", async () => {
    // Setup: project dir with queue.md having one Available task, no deps
    const dir = await setup({
      availableTasks: [
        {
          id: "TASK-001",
          title: "Integration test task",
          priority: "high",
          capabilities: ["code"],
        },
      ],
    });

    // Step 1: scanAndClaimTask returns { type: "claimed" }
    const claimResult = await scanAndClaimTask({
      agentId: "agent-int-1",
      agentCapabilities: ["code"],
      projectDir: dir,
    });
    expect(claimResult.type).toBe("claimed");
    if (claimResult.type !== "claimed") {
      throw new Error("expected claimed");
    }
    expect(claimResult.task.id).toBe("TASK-001");
    expect(claimResult.task.content).toContain("Integration test task");

    // Step 2: Verify queue.md now has task in Claimed section
    const queueContent = await fs.readFile(path.join(dir, "queue.md"), "utf8");
    const claimedSection = queueContent.split("## Claimed")[1]?.split("##")[0] ?? "";
    expect(claimedSection).toContain("TASK-001");
    // Task should NOT be in Available anymore
    const availableSection = queueContent.split("## Available")[1]?.split("##")[0] ?? "";
    expect(availableSection).not.toContain("TASK-001");

    // Step 3: Verify checkpoint.json exists
    const cpPath = path.join(dir, "tasks", "TASK-001.checkpoint.json");
    const cpContent = await fs.readFile(cpPath, "utf8");
    const cpData = JSON.parse(cpContent);
    expect(cpData.claimed_by).toBe("agent-int-1");
    expect(cpData.status).toBe("in-progress");
    expect(cpData.progress_pct).toBe(0);

    // Step 4: Call scanAndClaimTask again -- should return "resumed" (AGNT-08 short-circuit)
    const resumeResult = await scanAndClaimTask({
      agentId: "agent-int-1",
      agentCapabilities: ["code"],
      projectDir: dir,
    });
    expect(resumeResult.type).toBe("resumed");

    // Step 5: Verify resumed result has same task and checkpoint data
    if (resumeResult.type !== "resumed") {
      throw new Error("expected resumed");
    }
    expect(resumeResult.task.id).toBe("TASK-001");
    expect(resumeResult.task.content).toContain("Integration test task");
    expect(resumeResult.checkpoint.claimed_by).toBe("agent-int-1");
    expect(resumeResult.checkpoint.status).toBe("in-progress");
  });
});
