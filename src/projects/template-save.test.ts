import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseTemplateFrontmatter } from "./template-schema.js";
import { saveAsTemplate } from "./template-save.js";
import type { SaveAsTemplateOpts } from "./template-save.js";

describe("saveAsTemplate", () => {
  let tmpDir: string;
  let projectDir: string;
  let fakeHome: string;

  const SOURCE_CONTENT = `---
name: my-workflow
description: Original workflow
id: WF-001
status: active
goal: Build something
goal_check: Verify it works
created: "2026-01-01"
updated: "2026-01-02"
template: code-feature
params:
  feature_name:
    type: string
    description: Feature name
    required: true
steps:
  - id: design
    title: Design
    owner: agent
    verification_type: human
related_skills:
  - coding
related_tools:
  - git
triggered_by:
  - user-request
repeatable: true
per_item: file
prerequisites:
  - repo-access
---

# My Workflow

Some workflow body content.
`;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "tpl-save-"));
    projectDir = path.join(tmpDir, "project");
    fakeHome = path.join(tmpDir, "home");
    await fs.mkdir(projectDir, { recursive: true });
    await fs.mkdir(fakeHome, { recursive: true });
    vi.spyOn(os, "homedir").mockReturnValue(fakeHome);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("writes a template file to project-local dir when tier=project", async () => {
    const opts: SaveAsTemplateOpts = {
      name: "saved-tpl",
      description: "A saved template",
      tier: "project",
      projectDir,
      sourceContent: SOURCE_CONTENT,
    };

    const result = await saveAsTemplate(opts);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.path).toContain(path.join(projectDir, "templates", "saved-tpl.md"));
      const written = await fs.readFile(result.path, "utf-8");
      const parsed = parseTemplateFrontmatter(written);
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.name).toBe("saved-tpl");
        expect(parsed.data.description).toBe("A saved template");
      }
    }
  });

  it("writes a template file to global dir when tier=global", async () => {
    const opts: SaveAsTemplateOpts = {
      name: "global-tpl",
      description: "A global template",
      tier: "global",
      projectDir: null,
      sourceContent: SOURCE_CONTENT,
    };

    const result = await saveAsTemplate(opts);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const expectedDir = path.join(fakeHome, ".openclaw", "templates");
      expect(result.path).toContain(expectedDir);
    }
  });

  it("creates the templates/ directory if it does not exist", async () => {
    const templatesDir = path.join(projectDir, "templates");
    // Ensure it does NOT exist
    await fs.rm(templatesDir, { recursive: true, force: true }).catch(() => {});

    const opts: SaveAsTemplateOpts = {
      name: "new-tpl",
      description: "Created dir",
      tier: "project",
      projectDir,
      sourceContent: SOURCE_CONTENT,
    };

    const result = await saveAsTemplate(opts);
    expect(result.ok).toBe(true);
    // Directory should now exist
    const stat = await fs.stat(templatesDir);
    expect(stat.isDirectory()).toBe(true);
  });

  it("strips project-specific values from frontmatter", async () => {
    const opts: SaveAsTemplateOpts = {
      name: "stripped-tpl",
      description: "Stripped template",
      tier: "project",
      projectDir,
      sourceContent: SOURCE_CONTENT,
    };

    const result = await saveAsTemplate(opts);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const written = await fs.readFile(result.path, "utf-8");
      // Project-specific fields should NOT appear
      expect(written).not.toContain("id: WF-001");
      expect(written).not.toContain("status:");
      expect(written).not.toContain("goal:");
      expect(written).not.toContain("goal_check:");
      expect(written).not.toContain("created:");
      expect(written).not.toContain("updated:");
      expect(written).not.toContain("template:");
    }
  });

  it("preserves template-relevant fields", async () => {
    const opts: SaveAsTemplateOpts = {
      name: "preserved-tpl",
      description: "Preserved fields",
      tier: "project",
      projectDir,
      sourceContent: SOURCE_CONTENT,
    };

    const result = await saveAsTemplate(opts);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const written = await fs.readFile(result.path, "utf-8");
      const parsed = parseTemplateFrontmatter(written);
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.params).toHaveProperty("feature_name");
        expect(parsed.data.steps).toHaveLength(1);
        expect(parsed.data.related_skills).toContain("coding");
        expect(parsed.data.related_tools).toContain("git");
        expect(parsed.data.triggered_by).toContain("user-request");
        expect(parsed.data.repeatable).toBe(true);
        expect(parsed.data.per_item).toBe("file");
        expect(parsed.data.prerequisites).toContain("repo-access");
      }
    }
  });

  it("returns { ok: false } when template name conflicts with existing file", async () => {
    const templatesDir = path.join(projectDir, "templates");
    await fs.mkdir(templatesDir, { recursive: true });
    await fs.writeFile(path.join(templatesDir, "existing.md"), "existing content");

    const opts: SaveAsTemplateOpts = {
      name: "existing",
      description: "Should conflict",
      tier: "project",
      projectDir,
      sourceContent: SOURCE_CONTENT,
    };

    const result = await saveAsTemplate(opts);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("already exists");
    }
  });

  it("returns { ok: false } when tier=project but projectDir is null", async () => {
    const opts: SaveAsTemplateOpts = {
      name: "no-project",
      description: "No project dir",
      tier: "project",
      projectDir: null,
      sourceContent: SOURCE_CONTENT,
    };

    const result = await saveAsTemplate(opts);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("projectDir required");
    }
  });
});
