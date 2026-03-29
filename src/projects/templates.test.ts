import { describe, expect, it } from "vitest";
import {
  parseProjectFrontmatter,
  parseQueueFrontmatter,
  parseTaskFrontmatter,
  parseWorkflowFrontmatter,
} from "./frontmatter.js";
import {
  generateProjectMd,
  generateQueueMd,
  generateTaskMd,
  generateWorkflowMd,
} from "./templates.js";

describe("generateWorkflowMd", () => {
  it("produces string starting with ---", () => {
    const result = generateWorkflowMd({ id: "WF-001", title: "Test", goal: "Do X" });
    expect(result.startsWith("---\n")).toBe(true);
  });

  it("contains id in frontmatter", () => {
    const result = generateWorkflowMd({ id: "WF-001", title: "Test", goal: "Do X" });
    expect(result).toContain("id: WF-001");
  });

  it("contains status: draft in frontmatter", () => {
    const result = generateWorkflowMd({ id: "WF-001", title: "Test", goal: "Do X" });
    expect(result).toContain("status: draft");
  });

  it("contains ## Goal, ## Steps, ## Notes body sections", () => {
    const result = generateWorkflowMd({ id: "WF-001", title: "Test", goal: "Do X" });
    expect(result).toContain("## Goal");
    expect(result).toContain("## Steps");
    expect(result).toContain("## Notes");
  });

  it("includes goal text in body", () => {
    const result = generateWorkflowMd({ id: "WF-001", title: "Test", goal: "Build the widget" });
    // Goal text should appear after the ## Goal heading
    const goalSection = result.split("## Goal")[1].split("## Steps")[0];
    expect(goalSection).toContain("Build the widget");
  });

  it("applies defaults: empty tasks, null template, null goal_check", () => {
    const result = generateWorkflowMd({ id: "WF-001", title: "Test", goal: "Do X" });
    expect(result).toContain("tasks: []");
    expect(result).toMatch(/template: null/);
    expect(result).toMatch(/goal_check: null/);
  });

  it("accepts optional tasks, template, goalCheck params", () => {
    const result = generateWorkflowMd({
      id: "WF-001",
      title: "Test",
      goal: "Do X",
      tasks: ["TASK-001", "TASK-002"],
      template: "code-review",
      goalCheck: "npm test passes",
    });
    expect(result).toContain("TASK-001");
    expect(result).toContain("TASK-002");
    expect(result).toContain("template: code-review");
    expect(result).toContain("goal_check: npm test passes");
  });

  it("round-trips through parseWorkflowFrontmatter", () => {
    const md = generateWorkflowMd({ id: "WF-042", title: "Round Trip", goal: "Verify parsing" });
    const parsed = parseWorkflowFrontmatter(md, "test.md");
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.id).toBe("WF-042");
      expect(parsed.data.title).toBe("Round Trip");
      expect(parsed.data.goal).toBe("Verify parsing");
      expect(parsed.data.status).toBe("draft");
    }
  });
});

describe("generateProjectMd", () => {
  it("round-trips through parseProjectFrontmatter", () => {
    const md = generateProjectMd({ name: "test-proj", description: "A test" });
    const parsed = parseProjectFrontmatter(md, "PROJECT.md");
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.name).toBe("test-proj");
      expect(parsed.data.status).toBe("active");
    }
  });
});

describe("generateTaskMd", () => {
  const minimalOpts = { id: "TASK-001", title: "Test task" };
  const minimalBody = {
    objective: "Do something",
    context: "Some context here",
    actionGuidance: "Follow these steps",
    successCriteria: "It works",
    verificationMethod: "Run tests",
  };

  it("produces frontmatter that round-trips through parseTaskFrontmatter", () => {
    const md = generateTaskMd(minimalOpts, minimalBody);
    const parsed = parseTaskFrontmatter(md, "test.md");
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.id).toBe("TASK-001");
      expect(parsed.data.title).toBe("Test task");
    }
  });

  it("body contains all 5 DEC-02 section headings", () => {
    const md = generateTaskMd(minimalOpts, minimalBody);
    expect(md).toContain("## Objective");
    expect(md).toContain("## Context");
    expect(md).toContain("## Action Guidance");
    expect(md).toContain("## Success Criteria");
    expect(md).toContain("## Verification");
  });

  it("applies defaults when optional fields omitted", () => {
    const md = generateTaskMd(minimalOpts, minimalBody);
    expect(md).toContain("priority: medium");
    expect(md).toContain("verification_type: automatic");
    expect(md).toContain("status: backlog");
    expect(md).toContain("estimated_size: medium");
  });

  it("serializes capabilities array in YAML", () => {
    const md = generateTaskMd(
      { ...minimalOpts, capabilities: ["code", "test"] },
      minimalBody,
    );
    expect(md).toContain("code");
    expect(md).toContain("test");
  });

  it("serializes depends_on array in YAML", () => {
    const md = generateTaskMd(
      { ...minimalOpts, depends_on: ["TASK-002", "TASK-003"] },
      minimalBody,
    );
    expect(md).toContain("TASK-002");
    expect(md).toContain("TASK-003");
  });

  it("accepts workflow ID pattern in frontmatter", () => {
    const md = generateTaskMd(
      { ...minimalOpts, workflow: "WF-001" },
      minimalBody,
    );
    const parsed = parseTaskFrontmatter(md, "test.md");
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.workflow).toBe("WF-001");
    }
  });

  it("includes body text in correct sections", () => {
    const md = generateTaskMd(minimalOpts, {
      objective: "Build the widget",
      context: "Widget spec at docs/spec.md",
      actionGuidance: "Use React components",
      successCriteria: "Widget renders correctly",
      verificationMethod: "pnpm test -- widget.test.ts",
    });
    const objSection = md.split("## Objective")[1].split("## Context")[0];
    expect(objSection).toContain("Build the widget");
    const ctxSection = md.split("## Context")[1].split("## Action Guidance")[0];
    expect(ctxSection).toContain("Widget spec at docs/spec.md");
  });
});

describe("generateQueueMd", () => {
  it("round-trips through parseQueueFrontmatter", () => {
    const md = generateQueueMd();
    const parsed = parseQueueFrontmatter(md, "queue.md");
    expect(parsed.success).toBe(true);
  });

  it("contains four queue sections", () => {
    const md = generateQueueMd();
    expect(md).toContain("## Available");
    expect(md).toContain("## Claimed");
    expect(md).toContain("## Done");
    expect(md).toContain("## Blocked");
  });
});
