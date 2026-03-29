import { describe, expect, it } from "vitest";
import {
  ProjectFrontmatterSchema,
  QueueFrontmatterSchema,
  TaskFrontmatterSchema,
  WORKFLOW_ID_PATTERN,
  WorkflowFrontmatterSchema,
} from "./schemas.js";

describe("ProjectFrontmatterSchema", () => {
  it("parses valid project with only required fields and applies defaults", () => {
    const result = ProjectFrontmatterSchema.safeParse({ name: "test" });
    expect(result.success).toBe(true);
    if (!result.success) {
      return;
    }
    expect(result.data.name).toBe("test");
    expect(result.data.status).toBe("active");
    expect(result.data.tags).toEqual([]);
    expect(result.data.columns).toEqual(["Backlog", "In Progress", "Review", "Done"]);
    expect(result.data.dashboard.widgets).toEqual([
      "project-status",
      "task-counts",
      "active-agents",
      "sub-project-status",
      "recent-activity",
      "blockers",
    ]);
  });

  it("rejects empty object (name is required)", () => {
    const result = ProjectFrontmatterSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("preserves owner and tags when provided", () => {
    const result = ProjectFrontmatterSchema.safeParse({
      name: "test",
      owner: "alice",
      tags: ["ai", "code"],
    });
    expect(result.success).toBe(true);
    if (!result.success) {
      return;
    }
    expect(result.data.owner).toBe("alice");
    expect(result.data.tags).toEqual(["ai", "code"]);
  });

  it("accepts all valid status values", () => {
    for (const status of ["active", "paused", "complete"]) {
      const result = ProjectFrontmatterSchema.safeParse({ name: "test", status });
      expect(result.success).toBe(true);
    }
  });

  it("rejects invalid status", () => {
    const result = ProjectFrontmatterSchema.safeParse({ name: "test", status: "invalid" });
    expect(result.success).toBe(false);
  });

  it("accepts optional description, created, and updated fields", () => {
    const result = ProjectFrontmatterSchema.safeParse({
      name: "test",
      description: "A test project",
      created: "2026-03-26T00:00:00Z",
      updated: "2026-03-26T00:00:00Z",
    });
    expect(result.success).toBe(true);
    if (!result.success) {
      return;
    }
    expect(result.data.description).toBe("A test project");
    expect(result.data.created).toBe("2026-03-26T00:00:00Z");
    expect(result.data.updated).toBe("2026-03-26T00:00:00Z");
  });

  it("columns default is exactly Backlog, In Progress, Review, Done", () => {
    const result = ProjectFrontmatterSchema.safeParse({ name: "test" });
    expect(result.success).toBe(true);
    if (!result.success) {
      return;
    }
    expect(result.data.columns).toEqual(["Backlog", "In Progress", "Review", "Done"]);
  });
});

describe("TaskFrontmatterSchema", () => {
  it("parses valid task with required fields and applies defaults", () => {
    const result = TaskFrontmatterSchema.safeParse({ id: "TASK-001", title: "Do thing" });
    expect(result.success).toBe(true);
    if (!result.success) {
      return;
    }
    expect(result.data.id).toBe("TASK-001");
    expect(result.data.title).toBe("Do thing");
    expect(result.data.status).toBe("backlog");
    expect(result.data.priority).toBe("medium");
    expect(result.data.capabilities).toEqual([]);
    expect(result.data.depends_on).toEqual([]);
    expect(result.data.claimed_by).toBeNull();
  });

  it("preserves depends_on array of valid TASK-NNN ids", () => {
    const result = TaskFrontmatterSchema.safeParse({
      id: "TASK-001",
      title: "Do thing",
      depends_on: ["TASK-002", "TASK-003"],
    });
    expect(result.success).toBe(true);
    if (!result.success) {
      return;
    }
    expect(result.data.depends_on).toEqual(["TASK-002", "TASK-003"]);
  });

  it("rejects depends_on with invalid id format", () => {
    const result = TaskFrontmatterSchema.safeParse({
      id: "TASK-001",
      title: "Do thing",
      depends_on: ["invalid-id"],
    });
    expect(result.success).toBe(false);
  });

  it("rejects task with invalid id format", () => {
    const result = TaskFrontmatterSchema.safeParse({ id: "bad", title: "X" });
    expect(result.success).toBe(false);
  });

  it("accepts all valid status values", () => {
    for (const status of ["backlog", "in-progress", "review", "done", "blocked"]) {
      const result = TaskFrontmatterSchema.safeParse({
        id: "TASK-001",
        title: "Test",
        status,
      });
      expect(result.success).toBe(true);
    }
  });

  it("accepts all valid priority values", () => {
    for (const priority of ["low", "medium", "high", "critical"]) {
      const result = TaskFrontmatterSchema.safeParse({
        id: "TASK-001",
        title: "Test",
        priority,
      });
      expect(result.success).toBe(true);
    }
  });

  it("defaults column to Backlog", () => {
    const result = TaskFrontmatterSchema.safeParse({ id: "TASK-001", title: "Test" });
    expect(result.success).toBe(true);
    if (!result.success) {
      return;
    }
    expect(result.data.column).toBe("Backlog");
  });

  it("defaults claimed_at and parent to null", () => {
    const result = TaskFrontmatterSchema.safeParse({ id: "TASK-001", title: "Test" });
    expect(result.success).toBe(true);
    if (!result.success) {
      return;
    }
    expect(result.data.claimed_at).toBeNull();
    expect(result.data.parent).toBeNull();
  });
});

describe("WORKFLOW_ID_PATTERN", () => {
  it("matches valid workflow IDs", () => {
    expect(WORKFLOW_ID_PATTERN.test("WF-001")).toBe(true);
    expect(WORKFLOW_ID_PATTERN.test("WF-1000")).toBe(true);
    expect(WORKFLOW_ID_PATTERN.test("WF-1")).toBe(true);
  });

  it("rejects invalid workflow IDs", () => {
    expect(WORKFLOW_ID_PATTERN.test("WF-")).toBe(false);
    expect(WORKFLOW_ID_PATTERN.test("TASK-001")).toBe(false);
    expect(WORKFLOW_ID_PATTERN.test("wf-001")).toBe(false);
    expect(WORKFLOW_ID_PATTERN.test("WF001")).toBe(false);
    expect(WORKFLOW_ID_PATTERN.test("")).toBe(false);
  });
});

describe("WorkflowFrontmatterSchema", () => {
  it("parses valid workflow with required fields and applies defaults", () => {
    const result = WorkflowFrontmatterSchema.safeParse({
      id: "WF-001",
      title: "Test",
      goal: "Do thing",
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.id).toBe("WF-001");
    expect(result.data.title).toBe("Test");
    expect(result.data.goal).toBe("Do thing");
    expect(result.data.status).toBe("draft");
    expect(result.data.tasks).toEqual([]);
    expect(result.data.template).toBeNull();
    expect(result.data.goal_check).toBeNull();
  });

  it("rejects empty object (id, title, goal are required)", () => {
    const result = WorkflowFrontmatterSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("accepts all 5 status values", () => {
    for (const status of ["draft", "active", "paused", "completed", "failed"]) {
      const result = WorkflowFrontmatterSchema.safeParse({
        id: "WF-001",
        title: "Test",
        goal: "Do thing",
        status,
      });
      expect(result.success).toBe(true);
    }
  });

  it("rejects invalid status", () => {
    const result = WorkflowFrontmatterSchema.safeParse({
      id: "WF-001",
      title: "Test",
      goal: "Do thing",
      status: "invalid",
    });
    expect(result.success).toBe(false);
  });

  it("validates tasks array entries against TASK_ID_PATTERN", () => {
    const valid = WorkflowFrontmatterSchema.safeParse({
      id: "WF-001",
      title: "Test",
      goal: "Do thing",
      tasks: ["TASK-001", "TASK-002"],
    });
    expect(valid.success).toBe(true);

    const invalid = WorkflowFrontmatterSchema.safeParse({
      id: "WF-001",
      title: "Test",
      goal: "Do thing",
      tasks: ["bad-id"],
    });
    expect(invalid.success).toBe(false);
  });

  it("accepts id WF-1000 (not limited to 3 digits)", () => {
    const result = WorkflowFrontmatterSchema.safeParse({
      id: "WF-1000",
      title: "Test",
      goal: "Do thing",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid workflow id format", () => {
    const result = WorkflowFrontmatterSchema.safeParse({
      id: "bad",
      title: "Test",
      goal: "Do thing",
    });
    expect(result.success).toBe(false);
  });

  it("accepts optional created and updated fields", () => {
    const result = WorkflowFrontmatterSchema.safeParse({
      id: "WF-001",
      title: "Test",
      goal: "Do thing",
      created: "2026-03-29T00:00:00Z",
      updated: "2026-03-29T00:00:00Z",
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.created).toBe("2026-03-29T00:00:00Z");
    expect(result.data.updated).toBe("2026-03-29T00:00:00Z");
  });
});

describe("TaskFrontmatterSchema - orchestration extensions", () => {
  it("still parses minimal task (backward compat)", () => {
    const result = TaskFrontmatterSchema.safeParse({ id: "TASK-001", title: "X" });
    expect(result.success).toBe(true);
  });

  it("applies correct defaults for new orchestration fields", () => {
    const result = TaskFrontmatterSchema.safeParse({ id: "TASK-001", title: "X" });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.workflow).toBeNull();
    expect(result.data.verification_type).toBe("automatic");
    expect(result.data.side_effect_class).toBe("none");
    expect(result.data.approval_required).toBe(false);
    expect(result.data.estimated_size).toBe("medium");
    expect(result.data.execution_mode).toBe("auto");
  });

  it("accepts workflow with valid WF-NNN id", () => {
    const result = TaskFrontmatterSchema.safeParse({
      id: "TASK-001",
      title: "X",
      workflow: "WF-001",
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.workflow).toBe("WF-001");
  });

  it("rejects workflow with invalid format", () => {
    const result = TaskFrontmatterSchema.safeParse({
      id: "TASK-001",
      title: "X",
      workflow: "bad",
    });
    expect(result.success).toBe(false);
  });

  it("accepts all verification_type values", () => {
    for (const vt of ["automatic", "human", "external", "mixed"]) {
      const result = TaskFrontmatterSchema.safeParse({
        id: "TASK-001",
        title: "X",
        verification_type: vt,
      });
      expect(result.success).toBe(true);
    }
  });

  it("accepts all side_effect_class values", () => {
    for (const sec of ["none", "reversible", "irreversible"]) {
      const result = TaskFrontmatterSchema.safeParse({
        id: "TASK-001",
        title: "X",
        side_effect_class: sec,
      });
      expect(result.success).toBe(true);
    }
  });

  it("accepts all estimated_size values", () => {
    for (const size of ["small", "medium", "large"]) {
      const result = TaskFrontmatterSchema.safeParse({
        id: "TASK-001",
        title: "X",
        estimated_size: size,
      });
      expect(result.success).toBe(true);
    }
  });

  it("accepts all execution_mode values", () => {
    for (const mode of ["auto", "manual", "interactive"]) {
      const result = TaskFrontmatterSchema.safeParse({
        id: "TASK-001",
        title: "X",
        execution_mode: mode,
      });
      expect(result.success).toBe(true);
    }
  });
});

describe("ProjectFrontmatterSchema - orchestration extensions", () => {
  it("still parses minimal project (backward compat)", () => {
    const result = ProjectFrontmatterSchema.safeParse({ name: "test" });
    expect(result.success).toBe(true);
  });

  it("defaults allowed_capabilities to empty array", () => {
    const result = ProjectFrontmatterSchema.safeParse({ name: "test" });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.allowed_capabilities).toEqual([]);
  });

  it("accepts allowed_capabilities with string values", () => {
    const result = ProjectFrontmatterSchema.safeParse({
      name: "test",
      allowed_capabilities: ["code", "research"],
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.allowed_capabilities).toEqual(["code", "research"]);
  });
});

describe("QueueFrontmatterSchema", () => {
  it("parses empty object (all fields optional)", () => {
    const result = QueueFrontmatterSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("parses object with updated timestamp", () => {
    const result = QueueFrontmatterSchema.safeParse({ updated: "2026-03-26T14:30:00Z" });
    expect(result.success).toBe(true);
    if (!result.success) {
      return;
    }
    expect(result.data.updated).toBe("2026-03-26T14:30:00Z");
  });
});
