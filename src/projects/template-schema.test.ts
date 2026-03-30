import { describe, expect, it } from "vitest";
import {
  WorkflowTemplateFrontmatterSchema,
  WorkflowTemplateStepSchema,
  parseTemplateFrontmatter,
} from "./template-schema.js";

describe("WorkflowTemplateFrontmatterSchema", () => {
  it("parses valid template frontmatter with all fields", () => {
    const input = {
      name: "code-feature",
      description: "Implement a code feature",
      params: {
        feature_name: {
          type: "string",
          description: "Name of the feature",
          required: true,
        },
        dry_run: {
          type: "boolean",
          description: "Run without side effects",
          required: false,
          default: false,
        },
      },
      related_skills: ["coding", "testing"],
      related_tools: ["git", "npm"],
      templates: ["design-doc"],
      triggered_by: ["user-request"],
      repeatable: true,
      per_item: "file",
      prerequisites: ["repo-access"],
      steps: [
        {
          id: "design",
          title: "Design the feature",
          owner: "agent",
          description: "Create a design document",
          capabilities: ["code"],
          depends_on: [],
          verification_type: "human",
          side_effect_class: "none",
        },
      ],
    };

    const result = WorkflowTemplateFrontmatterSchema.parse(input);
    expect(result.name).toBe("code-feature");
    expect(result.description).toBe("Implement a code feature");
    expect(result.params.feature_name.type).toBe("string");
    expect(result.params.dry_run.default).toBe(false);
    expect(result.related_skills).toEqual(["coding", "testing"]);
    expect(result.related_tools).toEqual(["git", "npm"]);
    expect(result.templates).toEqual(["design-doc"]);
    expect(result.triggered_by).toEqual(["user-request"]);
    expect(result.repeatable).toBe(true);
    expect(result.per_item).toBe("file");
    expect(result.prerequisites).toEqual(["repo-access"]);
    expect(result.steps).toHaveLength(1);
    expect(result.steps[0].id).toBe("design");
  });

  it("parses minimal template frontmatter with defaults", () => {
    const input = {
      name: "simple-task",
      description: "A simple task template",
    };

    const result = WorkflowTemplateFrontmatterSchema.parse(input);
    expect(result.name).toBe("simple-task");
    expect(result.description).toBe("A simple task template");
    expect(result.params).toEqual({});
    expect(result.related_skills).toEqual([]);
    expect(result.related_tools).toEqual([]);
    expect(result.templates).toEqual([]);
    expect(result.triggered_by).toEqual([]);
    expect(result.repeatable).toBe(false);
    expect(result.per_item).toBeNull();
    expect(result.prerequisites).toEqual([]);
    expect(result.steps).toEqual([]);
  });

  it("validates param type enum", () => {
    const valid = {
      name: "test",
      description: "test",
      params: {
        a: { type: "string" },
        b: { type: "string[]" },
        c: { type: "boolean" },
        d: { type: "number" },
      },
    };
    const result = WorkflowTemplateFrontmatterSchema.parse(valid);
    expect(result.params.a.type).toBe("string");
    expect(result.params.b.type).toBe("string[]");
    expect(result.params.c.type).toBe("boolean");
    expect(result.params.d.type).toBe("number");

    const invalid = {
      name: "test",
      description: "test",
      params: { a: { type: "object" } },
    };
    expect(() => WorkflowTemplateFrontmatterSchema.parse(invalid)).toThrow();
  });

  it("validates step fields", () => {
    const step = {
      id: "step-1",
      title: "Do something",
      owner: "mixed",
      capabilities: ["code", "research"],
      depends_on: ["step-0"],
      verification_type: "external",
      side_effect_class: "irreversible",
    };
    const result = WorkflowTemplateStepSchema.parse(step);
    expect(result.id).toBe("step-1");
    expect(result.owner).toBe("mixed");
    expect(result.capabilities).toEqual(["code", "research"]);
    expect(result.depends_on).toEqual(["step-0"]);
    expect(result.verification_type).toBe("external");
    expect(result.side_effect_class).toBe("irreversible");
  });

  it("rejects template missing required name", () => {
    const invalid = { description: "no name" };
    expect(() => WorkflowTemplateFrontmatterSchema.parse(invalid)).toThrow();
  });

  it("rejects template missing required description", () => {
    const invalid = { name: "no-desc" };
    expect(() => WorkflowTemplateFrontmatterSchema.parse(invalid)).toThrow();
  });
});

describe("parseTemplateFrontmatter", () => {
  it("extracts and validates YAML frontmatter from markdown", () => {
    const md = `---
name: my-template
description: A test template
params:
  topic:
    type: string
    required: true
steps:
  - id: gather
    title: Gather info
---

# Template Body

Some template content here.
`;
    const result = parseTemplateFrontmatter(md);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe("my-template");
      expect(result.data.description).toBe("A test template");
      expect(result.data.params.topic.type).toBe("string");
      expect(result.data.steps).toHaveLength(1);
      expect(result.data.steps[0].id).toBe("gather");
    }
  });

  it("returns error for invalid YAML", () => {
    const md = `---
name: [invalid yaml
---
`;
    const result = parseTemplateFrontmatter(md);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.message).toContain("YAML");
    }
  });

  it("returns error when frontmatter block is missing", () => {
    const md = `# No frontmatter here`;
    const result = parseTemplateFrontmatter(md);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.message).toContain("frontmatter");
    }
  });

  it("returns error for schema validation failure", () => {
    const md = `---
not_a_name: something
---
`;
    const result = parseTemplateFrontmatter(md);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.message).toContain("Schema validation failed");
    }
  });
});
