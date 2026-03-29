import { describe, expect, it } from "vitest";
import { generateProjectMd, generateQueueMd, generateWorkflowMd } from "./templates.js";
import { parseProjectFrontmatter, parseQueueFrontmatter, parseWorkflowFrontmatter } from "./frontmatter.js";

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
