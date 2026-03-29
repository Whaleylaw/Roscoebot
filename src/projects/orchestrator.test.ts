import { describe, it, expect } from "vitest";
import { validateTaskGraph, type DecomposedTask } from "./orchestrator.js";

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
      expect(result.errors.some((e) => e.includes("TASK-999") && e.includes("does not exist"))).toBe(true);
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
      expect(result.errors.some((e) => e.includes("exotic-cap") && e.includes("unregistered"))).toBe(true);
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
