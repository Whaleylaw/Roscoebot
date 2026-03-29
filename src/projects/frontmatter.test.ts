import { describe, expect, it } from "vitest";
import {
  parseProjectFrontmatter,
  parseQueueFrontmatter,
  parseTaskFrontmatter,
  parseWorkflowFrontmatter,
} from "./frontmatter.js";

describe("parseProjectFrontmatter", () => {
  it("parses minimal valid frontmatter with defaults", () => {
    const result = parseProjectFrontmatter("---\nname: Test\n---\n# Body", "test.md");
    expect(result.success).toBe(true);
    if (!result.success) {
      return;
    }
    expect(result.data.name).toBe("Test");
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

  it("preserves arrays and nested objects (not flattened to strings)", () => {
    const content = [
      "---",
      "name: Test",
      "tags: [ai, code]",
      "dashboard:",
      "  widgets:",
      "    - task-counts",
      "---",
      "",
    ].join("\n");
    const result = parseProjectFrontmatter(content, "test.md");
    expect(result.success).toBe(true);
    if (!result.success) {
      return;
    }
    expect(result.data.tags).toEqual(["ai", "code"]);
    expect(Array.isArray(result.data.tags)).toBe(true);
    expect(result.data.dashboard.widgets).toEqual(["task-counts"]);
    expect(Array.isArray(result.data.dashboard.widgets)).toBe(true);
  });

  it("returns error when no frontmatter block found", () => {
    const result = parseProjectFrontmatter("no frontmatter here", "bad.md");
    expect(result.success).toBe(false);
    if (result.success) {
      return;
    }
    expect(result.error.filePath).toBe("bad.md");
    expect(result.error.message).toBe("No frontmatter block found");
    expect(result.error.issues).toEqual([]);
  });

  it("returns error when required field is missing", () => {
    const result = parseProjectFrontmatter("---\nstatus: active\n---\n", "missing-name.md");
    expect(result.success).toBe(false);
    if (result.success) {
      return;
    }
    expect(result.error.filePath).toBe("missing-name.md");
    expect(result.error.message).toBe("Schema validation failed");
    expect(result.error.issues.length).toBeGreaterThan(0);
    expect(result.error.issues[0].path).toBe("name");
    // Zod reports "Invalid input: expected string, received undefined" for missing required fields
    expect(result.error.issues[0].message).toMatch(/required|expected string/i);
  });

  it("returns error with line number for YAML syntax errors", () => {
    const result = parseProjectFrontmatter(
      "---\nname: Test\n  bad: yaml: here\n---\n",
      "bad-yaml.md",
    );
    expect(result.success).toBe(false);
    if (result.success) {
      return;
    }
    expect(result.error.filePath).toBe("bad-yaml.md");
    expect(result.error.message).toContain("YAML parse error");
    expect(result.error.issues.length).toBeGreaterThan(0);
    // Line number should be present from YAML parser
    expect(result.error.issues[0].line).toBeDefined();
    expect(typeof result.error.issues[0].line).toBe("number");
  });

  it("normalizes CRLF line endings", () => {
    const content = "---\r\nname: Test\r\n---\r\n# Body";
    const result = parseProjectFrontmatter(content, "crlf.md");
    expect(result.success).toBe(true);
    if (!result.success) {
      return;
    }
    expect(result.data.name).toBe("Test");
  });
});

describe("parseTaskFrontmatter", () => {
  it("parses valid task with defaults", () => {
    const result = parseTaskFrontmatter("---\nid: TASK-001\ntitle: Do thing\n---\n", "task.md");
    expect(result.success).toBe(true);
    if (!result.success) {
      return;
    }
    expect(result.data.id).toBe("TASK-001");
    expect(result.data.title).toBe("Do thing");
    expect(result.data.status).toBe("backlog");
    expect(result.data.priority).toBe("medium");
    expect(result.data.depends_on).toEqual([]);
    expect(result.data.capabilities).toEqual([]);
    expect(result.data.claimed_by).toBeNull();
  });

  it("preserves depends_on and capabilities as real arrays", () => {
    const content = [
      "---",
      "id: TASK-001",
      "title: Do thing",
      "depends_on:",
      "  - TASK-002",
      "  - TASK-003",
      "capabilities: [code, ui]",
      "---",
      "",
    ].join("\n");
    const result = parseTaskFrontmatter(content, "task.md");
    expect(result.success).toBe(true);
    if (!result.success) {
      return;
    }
    expect(result.data.depends_on).toEqual(["TASK-002", "TASK-003"]);
    expect(Array.isArray(result.data.depends_on)).toBe(true);
    expect(result.data.capabilities).toEqual(["code", "ui"]);
    expect(Array.isArray(result.data.capabilities)).toBe(true);
  });

  it("returns error for invalid task ID pattern", () => {
    const result = parseTaskFrontmatter("---\nid: BAD-ID\ntitle: Test\n---\n", "bad-id.md");
    expect(result.success).toBe(false);
    if (result.success) {
      return;
    }
    expect(result.error.filePath).toBe("bad-id.md");
    expect(result.error.issues.length).toBeGreaterThan(0);
    expect(result.error.issues[0].path).toBe("id");
  });

  it("returns error for invalid depends_on entry", () => {
    const content = [
      "---",
      "id: TASK-001",
      "title: Test",
      "depends_on:",
      "  - NOT-A-TASK",
      "---",
      "",
    ].join("\n");
    const result = parseTaskFrontmatter(content, "bad-dep.md");
    expect(result.success).toBe(false);
    if (result.success) {
      return;
    }
    expect(result.error.issues.length).toBeGreaterThan(0);
  });
});

describe("parseQueueFrontmatter", () => {
  it("parses queue with updated field", () => {
    const result = parseQueueFrontmatter(
      "---\nupdated: 2026-03-26T14:30:00Z\n---\n## Available\n...",
      "queue.md",
    );
    expect(result.success).toBe(true);
    if (!result.success) {
      return;
    }
    expect(result.data.updated).toBe("2026-03-26T14:30:00Z");
  });

  it("parses empty frontmatter with undefined updated", () => {
    const result = parseQueueFrontmatter("---\n---\n## Available", "queue.md");
    expect(result.success).toBe(true);
    if (!result.success) {
      return;
    }
    expect(result.data.updated).toBeUndefined();
  });
});

describe("parseWorkflowFrontmatter", () => {
  it("parses valid workflow frontmatter with all fields", () => {
    const content = [
      "---",
      "id: WF-001",
      "title: Deploy pipeline",
      "goal: Set up CI/CD",
      "status: active",
      "goal_check: CI passes on push",
      "tasks:",
      "  - TASK-001",
      "  - TASK-002",
      "template: ci-cd",
      "created: 2026-03-29T00:00:00Z",
      "updated: 2026-03-29T00:00:00Z",
      "---",
      "# Workflow body",
    ].join("\n");
    const result = parseWorkflowFrontmatter(content, "wf.md");
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.id).toBe("WF-001");
    expect(result.data.title).toBe("Deploy pipeline");
    expect(result.data.goal).toBe("Set up CI/CD");
    expect(result.data.status).toBe("active");
    expect(result.data.goal_check).toBe("CI passes on push");
    expect(result.data.tasks).toEqual(["TASK-001", "TASK-002"]);
    expect(result.data.template).toBe("ci-cd");
  });

  it("applies defaults for optional fields", () => {
    const content = "---\nid: WF-001\ntitle: Test\ngoal: Do thing\n---\n";
    const result = parseWorkflowFrontmatter(content, "wf.md");
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.status).toBe("draft");
    expect(result.data.tasks).toEqual([]);
    expect(result.data.template).toBeNull();
    expect(result.data.goal_check).toBeNull();
  });

  it("returns error when no frontmatter block found", () => {
    const result = parseWorkflowFrontmatter("no frontmatter here", "bad.md");
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.message).toBe("No frontmatter block found");
  });

  it("returns error for invalid YAML", () => {
    const result = parseWorkflowFrontmatter(
      "---\nid: WF-001\n  bad: yaml: here\n---\n",
      "bad-yaml.md",
    );
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.message).toContain("YAML parse error");
  });

  it("returns error for missing required field (no id)", () => {
    const content = "---\ntitle: Test\ngoal: Do thing\n---\n";
    const result = parseWorkflowFrontmatter(content, "missing-id.md");
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.message).toBe("Schema validation failed");
    expect(result.error.issues.length).toBeGreaterThan(0);
  });

  it("validates tasks array entries against TASK_ID_PATTERN", () => {
    const content = [
      "---",
      "id: WF-001",
      "title: Test",
      "goal: Do thing",
      "tasks:",
      "  - TASK-001",
      "  - TASK-002",
      "---",
      "",
    ].join("\n");
    const result = parseWorkflowFrontmatter(content, "wf.md");
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.tasks).toEqual(["TASK-001", "TASK-002"]);
  });
});
