import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { listAllTemplates, resolveTemplate } from "./template-resolver.js";

describe("resolveTemplate", () => {
  let tmpDir: string;
  let projectDir: string;
  let fakeHome: string;

  const VALID_TEMPLATE = `---
name: my-template
description: A test template
steps: []
---

# My Template
`;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "tpl-resolver-"));
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

  it("finds a template in project-local tier", async () => {
    const templatesDir = path.join(projectDir, "templates");
    await fs.mkdir(templatesDir, { recursive: true });
    await fs.writeFile(path.join(templatesDir, "my-template.md"), VALID_TEMPLATE);

    const result = await resolveTemplate("my-template", projectDir);
    expect(result).not.toBeNull();
    expect(result!.tier).toBe("project");
    expect(result!.name).toBe("my-template");
    expect(result!.frontmatter.description).toBe("A test template");
  });

  it("falls through to global tier when project-local not found", async () => {
    const globalDir = path.join(fakeHome, ".openclaw", "templates");
    await fs.mkdir(globalDir, { recursive: true });
    await fs.writeFile(path.join(globalDir, "my-template.md"), VALID_TEMPLATE);

    const result = await resolveTemplate("my-template", projectDir);
    expect(result).not.toBeNull();
    expect(result!.tier).toBe("global");
    expect(result!.name).toBe("my-template");
  });

  it("falls through to bundled tier when neither project-local nor global found", async () => {
    const result = await resolveTemplate("code-feature", projectDir);
    expect(result).not.toBeNull();
    expect(result!.tier).toBe("bundled");
    expect(result!.name).toBe("code-feature");
  });

  it("returns null when template not found in any tier", async () => {
    const result = await resolveTemplate("nonexistent-template", projectDir);
    expect(result).toBeNull();
  });

  it("works with projectDir=null (skips tier 1, checks global and bundled)", async () => {
    const globalDir = path.join(fakeHome, ".openclaw", "templates");
    await fs.mkdir(globalDir, { recursive: true });
    await fs.writeFile(path.join(globalDir, "my-template.md"), VALID_TEMPLATE);

    const result = await resolveTemplate("my-template", null);
    expect(result).not.toBeNull();
    expect(result!.tier).toBe("global");
  });

  it("handles missing templates/ directory gracefully (ENOENT)", async () => {
    // Project dir exists but has no templates/ subdirectory
    // Global dir does not exist either
    const result = await resolveTemplate("my-template", projectDir);
    expect(result).toBeNull();
  });

  it("project-local takes precedence over global with same name", async () => {
    // Put template in both project-local and global
    const projectTemplatesDir = path.join(projectDir, "templates");
    await fs.mkdir(projectTemplatesDir, { recursive: true });
    await fs.writeFile(path.join(projectTemplatesDir, "my-template.md"), VALID_TEMPLATE);

    const globalDir = path.join(fakeHome, ".openclaw", "templates");
    await fs.mkdir(globalDir, { recursive: true });
    const globalTemplate = VALID_TEMPLATE.replace("A test template", "Global version");
    await fs.writeFile(path.join(globalDir, "my-template.md"), globalTemplate);

    const result = await resolveTemplate("my-template", projectDir);
    expect(result).not.toBeNull();
    expect(result!.tier).toBe("project");
    expect(result!.frontmatter.description).toBe("A test template");
  });
});

describe("listAllTemplates", () => {
  let tmpDir: string;
  let projectDir: string;
  let fakeHome: string;

  const makeTemplate = (name: string, description: string) => `---
name: ${name}
description: "${description}"
steps: []
---

# ${name}
`;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "tpl-list-"));
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

  it("returns templates from all three tiers with tier and name fields", async () => {
    const projectTemplatesDir = path.join(projectDir, "templates");
    await fs.mkdir(projectTemplatesDir, { recursive: true });
    await fs.writeFile(
      path.join(projectTemplatesDir, "local-tpl.md"),
      makeTemplate("local-tpl", "A local template"),
    );

    const globalDir = path.join(fakeHome, ".openclaw", "templates");
    await fs.mkdir(globalDir, { recursive: true });
    await fs.writeFile(
      path.join(globalDir, "global-tpl.md"),
      makeTemplate("global-tpl", "A global template"),
    );

    const result = await listAllTemplates(projectDir);

    // Should include local, global, and bundled templates
    const names = result.map((t) => t.name);
    expect(names).toContain("local-tpl");
    expect(names).toContain("global-tpl");
    expect(names).toContain("code-feature");
    expect(names).toContain("research-report");
    expect(names).toContain("ops-runbook");

    // Verify tier annotations
    const localEntry = result.find((t) => t.name === "local-tpl");
    expect(localEntry!.tier).toBe("project");
    const globalEntry = result.find((t) => t.name === "global-tpl");
    expect(globalEntry!.tier).toBe("global");
    const bundledEntry = result.find((t) => t.name === "code-feature");
    expect(bundledEntry!.tier).toBe("bundled");
  });

  it("deduplicates -- project-local shadows global and bundled with same name", async () => {
    // Create a project-local template with the same name as a bundled one
    const projectTemplatesDir = path.join(projectDir, "templates");
    await fs.mkdir(projectTemplatesDir, { recursive: true });
    await fs.writeFile(
      path.join(projectTemplatesDir, "code-feature.md"),
      makeTemplate("code-feature", "Custom code feature"),
    );

    const result = await listAllTemplates(projectDir);
    const codeFeatureEntries = result.filter((t) => t.name === "code-feature");
    expect(codeFeatureEntries).toHaveLength(1);
    expect(codeFeatureEntries[0].tier).toBe("project");
    expect(codeFeatureEntries[0].description).toBe("Custom code feature");
  });

  it("returns sorted by name alphabetically", async () => {
    const result = await listAllTemplates(null);
    const names = result.map((t) => t.name);
    const sorted = [...names].sort();
    expect(names).toEqual(sorted);
  });
});
