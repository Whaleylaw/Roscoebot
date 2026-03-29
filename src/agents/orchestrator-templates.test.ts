import { describe, expect, it } from "vitest";
import {
  getOrchestratorWorkspaceFiles,
  ORCHESTRATOR_AGENTS_MD,
  ORCHESTRATOR_IDENTITY_MD,
  ORCHESTRATOR_SOUL_MD,
} from "./orchestrator-templates.js";

describe("orchestrator workspace templates", () => {
  it("ORCHESTRATOR_AGENTS_MD contains Decomposition Standards heading", () => {
    expect(ORCHESTRATOR_AGENTS_MD).toContain("## Decomposition Standards");
  });

  it("ORCHESTRATOR_AGENTS_MD contains Dispatch Policy heading", () => {
    expect(ORCHESTRATOR_AGENTS_MD).toContain("## Dispatch Policy");
  });

  it("getOrchestratorWorkspaceFiles returns 3 files with correct filenames", () => {
    const files = getOrchestratorWorkspaceFiles();
    expect(files).toHaveLength(3);
    expect(files.map((f) => f.filename)).toEqual(["IDENTITY.md", "SOUL.md", "AGENTS.md"]);
  });

  it("each template is non-empty and starts with #", () => {
    const templates = [ORCHESTRATOR_IDENTITY_MD, ORCHESTRATOR_SOUL_MD, ORCHESTRATOR_AGENTS_MD];
    for (const t of templates) {
      expect(t.length).toBeGreaterThan(0);
      expect(t.trimStart().startsWith("#")).toBe(true);
    }
  });

  it("ORCHESTRATOR_AGENTS_MD contains all 5 DEC-02 task sections", () => {
    // The Decomposition Standards section should reference all 5 required task sections
    expect(ORCHESTRATOR_AGENTS_MD).toContain("**Objective**");
    expect(ORCHESTRATOR_AGENTS_MD).toContain("**Context**");
    expect(ORCHESTRATOR_AGENTS_MD).toContain("**Action Guidance**");
    expect(ORCHESTRATOR_AGENTS_MD).toContain("**Success Criteria**");
    expect(ORCHESTRATOR_AGENTS_MD).toContain("**Verification Method**");
  });
});
