import { describe, expect, it } from "vitest";
import { BUNDLED_TEMPLATES, getBundledTemplate, listBundledTemplates } from "./template-bundled.js";
import { WorkflowTemplateFrontmatterSchema, parseTemplateFrontmatter } from "./template-schema.js";

describe("BUNDLED_TEMPLATES", () => {
  it("contains exactly 3 entries", () => {
    expect(BUNDLED_TEMPLATES.size).toBe(3);
    expect(BUNDLED_TEMPLATES.has("code-feature")).toBe(true);
    expect(BUNDLED_TEMPLATES.has("research-report")).toBe(true);
    expect(BUNDLED_TEMPLATES.has("ops-runbook")).toBe(true);
  });

  it("each bundled template parses through WorkflowTemplateFrontmatterSchema", () => {
    for (const [name, content] of BUNDLED_TEMPLATES) {
      const result = parseTemplateFrontmatter(content);
      expect(result.success, `template "${name}" should parse successfully`).toBe(true);
      if (result.success) {
        // Verify the parsed name matches the map key
        expect(result.data.name).toBe(name);
      }
    }
  });

  it("code-feature template has expected params", () => {
    const result = parseTemplateFrontmatter(BUNDLED_TEMPLATES.get("code-feature")!);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.params).toHaveProperty("feature_name");
      expect(result.data.params.feature_name.type).toBe("string");
      expect(result.data.params).toHaveProperty("codebase_context");
      expect(result.data.params.codebase_context.type).toBe("string");
    }
  });

  it("research-report template has expected params", () => {
    const result = parseTemplateFrontmatter(BUNDLED_TEMPLATES.get("research-report")!);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.params).toHaveProperty("topic");
      expect(result.data.params.topic.type).toBe("string");
      expect(result.data.params).toHaveProperty("depth");
      expect(result.data.params.depth.type).toBe("string");
    }
  });

  it("ops-runbook template has expected params", () => {
    const result = parseTemplateFrontmatter(BUNDLED_TEMPLATES.get("ops-runbook")!);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.params).toHaveProperty("service");
      expect(result.data.params.service.type).toBe("string");
      expect(result.data.params).toHaveProperty("operation");
      expect(result.data.params.operation.type).toBe("string");
    }
  });
});

describe("getBundledTemplate", () => {
  it("returns template content for existing template", () => {
    const result = getBundledTemplate("code-feature");
    expect(result).not.toBeNull();
    expect(result!.name).toBe("code-feature");
    expect(result!.content).toContain("code-feature");
  });

  it("returns null for nonexistent template", () => {
    const result = getBundledTemplate("nonexistent");
    expect(result).toBeNull();
  });
});

describe("listBundledTemplates", () => {
  it("returns array of name and description for all 3 templates", () => {
    const list = listBundledTemplates();
    expect(list).toHaveLength(3);

    const names = list.map((t) => t.name);
    expect(names).toContain("code-feature");
    expect(names).toContain("research-report");
    expect(names).toContain("ops-runbook");

    // Each entry should have a non-empty description
    for (const entry of list) {
      expect(entry.description).toBeTruthy();
      expect(typeof entry.description).toBe("string");
    }
  });
});
