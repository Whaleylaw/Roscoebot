import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { ProjectSummary } from "./placement.js";
import { formatProjectsForPlacement, readProjectSummaries } from "./placement.js";

describe("formatProjectsForPlacement", () => {
  it("produces structured text summary with project name, description, status, tags, capabilities", () => {
    const summaries: ProjectSummary[] = [
      {
        name: "web-app",
        description: "A web application for managing tasks",
        status: "active",
        tags: ["web", "typescript"],
        capabilities: ["coding", "testing"],
        projectDir: "/projects/web-app",
      },
    ];

    const result = formatProjectsForPlacement(summaries);

    expect(result).toContain("Project: web-app");
    expect(result).toContain("Description: A web application for managing tasks");
    expect(result).toContain("Tags: web, typescript");
    expect(result).toContain("Capabilities: coding, testing");
  });

  it("returns a no active projects message when list is empty", () => {
    const result = formatProjectsForPlacement([]);
    expect(result).toContain("No active projects found");
    expect(result).toContain("new project");
  });

  it("handles projects with missing optional fields (no description, no tags)", () => {
    const summaries: ProjectSummary[] = [
      {
        name: "bare-project",
        description: "",
        status: "active",
        tags: [],
        capabilities: [],
        projectDir: "/projects/bare",
      },
    ];

    const result = formatProjectsForPlacement(summaries);

    expect(result).toContain("Project: bare-project");
    expect(result).toContain("Tags: none");
    expect(result).toContain("Capabilities: none");
  });

  it("formats multiple projects separated by delimiters", () => {
    const summaries: ProjectSummary[] = [
      {
        name: "alpha",
        description: "First project",
        status: "active",
        tags: ["a"],
        capabilities: ["coding"],
        projectDir: "/projects/alpha",
      },
      {
        name: "beta",
        description: "Second project",
        status: "active",
        tags: ["b"],
        capabilities: ["research"],
        projectDir: "/projects/beta",
      },
    ];

    const result = formatProjectsForPlacement(summaries);

    expect(result).toContain("Project: alpha");
    expect(result).toContain("Project: beta");
    expect(result).toContain("---");
  });
});

describe("readProjectSummaries", () => {
  it("reads PROJECT.md files and filters to active projects only", async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "placement-test-"));
    try {
      // Create active project
      const activeDir = path.join(tmpDir, "active-proj");
      await fs.mkdir(activeDir, { recursive: true });
      await fs.writeFile(
        path.join(activeDir, "PROJECT.md"),
        `---
name: active-proj
status: active
description: An active project
tags:
  - web
allowed_capabilities:
  - coding
---
# Active Project
`,
      );

      // Create paused project (should be excluded)
      const pausedDir = path.join(tmpDir, "paused-proj");
      await fs.mkdir(pausedDir, { recursive: true });
      await fs.writeFile(
        path.join(pausedDir, "PROJECT.md"),
        `---
name: paused-proj
status: paused
description: A paused project
---
# Paused Project
`,
      );

      // Create complete project (should be excluded)
      const completeDir = path.join(tmpDir, "complete-proj");
      await fs.mkdir(completeDir, { recursive: true });
      await fs.writeFile(
        path.join(completeDir, "PROJECT.md"),
        `---
name: complete-proj
status: complete
---
# Complete Project
`,
      );

      const summaries = await readProjectSummaries([activeDir, pausedDir, completeDir]);

      expect(summaries).toHaveLength(1);
      expect(summaries[0].name).toBe("active-proj");
      expect(summaries[0].description).toBe("An active project");
      expect(summaries[0].tags).toEqual(["web"]);
      expect(summaries[0].capabilities).toEqual(["coding"]);
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });

  it("handles projects with missing optional fields gracefully", async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "placement-test-"));
    try {
      const projDir = path.join(tmpDir, "minimal-proj");
      await fs.mkdir(projDir, { recursive: true });
      await fs.writeFile(
        path.join(projDir, "PROJECT.md"),
        `---
name: minimal-proj
status: active
---
# Minimal
`,
      );

      const summaries = await readProjectSummaries([projDir]);

      expect(summaries).toHaveLength(1);
      expect(summaries[0].description).toBe("");
      expect(summaries[0].tags).toEqual([]);
      expect(summaries[0].capabilities).toEqual([]);
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });
});

describe("PlacementSuggestion type", () => {
  it("includes action, projectName, projectDir, rationale fields", () => {
    // Verify type compiles with expected shape at runtime
    const suggestion: import("./placement.js").PlacementSuggestion = {
      action: "existing",
      projectName: "my-project",
      projectDir: "/projects/my-project",
      rationale: "This matches the existing project scope",
    };
    expect(suggestion.action).toBe("existing");
    expect(suggestion.projectName).toBe("my-project");
    expect(suggestion.projectDir).toBe("/projects/my-project");
    expect(suggestion.rationale).toBe("This matches the existing project scope");

    const newSuggestion: import("./placement.js").PlacementSuggestion = {
      action: "new",
      projectName: null,
      projectDir: null,
      rationale: "No matching project found",
    };
    expect(newSuggestion.action).toBe("new");
    expect(newSuggestion.projectName).toBeNull();
    expect(newSuggestion.projectDir).toBeNull();
  });
});
