import { describe, expect, it } from "vitest";
import { buildIntakePayload, parseIntakePayload } from "./intake-payload.js";

describe("parseIntakePayload", () => {
  it("accepts valid intake JSON with all fields", () => {
    const msg = JSON.stringify({
      type: "orchestrate",
      goal: "Build a REST API",
      goalTitle: "REST API",
      project: "backend",
      projectDir: "/projects/backend",
      templateName: "coding-feature",
      templateParams: { language: "typescript", framework: "hono" },
      synthesize: false,
      placementOverride: {
        action: "existing",
        projectName: "backend",
        projectDir: "/projects/backend",
      },
      artifactType: "workflow",
    });

    const result = parseIntakePayload(msg);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.payload.type).toBe("orchestrate");
    expect(result.payload.goal).toBe("Build a REST API");
    expect(result.payload.goalTitle).toBe("REST API");
    expect(result.payload.project).toBe("backend");
    expect(result.payload.projectDir).toBe("/projects/backend");
    expect(result.payload.templateName).toBe("coding-feature");
    expect(result.payload.templateParams).toEqual({ language: "typescript", framework: "hono" });
    expect(result.payload.synthesize).toBe(false);
    expect(result.payload.placementOverride).toEqual({
      action: "existing",
      projectName: "backend",
      projectDir: "/projects/backend",
    });
    expect(result.payload.artifactType).toBe("workflow");
  });

  it("accepts minimal payload (type, goal, goalTitle, project, projectDir only)", () => {
    const msg = JSON.stringify({
      type: "orchestrate",
      goal: "Fix the login bug",
      goalTitle: "Login fix",
      project: "frontend",
      projectDir: "/projects/frontend",
    });

    const result = parseIntakePayload(msg);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.payload.goal).toBe("Fix the login bug");
    expect(result.payload.templateName).toBeUndefined();
    expect(result.payload.templateParams).toBeUndefined();
    expect(result.payload.synthesize).toBeUndefined();
    expect(result.payload.placementOverride).toBeUndefined();
    expect(result.payload.artifactType).toBeUndefined();
  });

  it("rejects invalid JSON", () => {
    const result = parseIntakePayload("not json at all");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("JSON");
  });

  it("rejects missing required fields", () => {
    // Missing goal
    const result1 = parseIntakePayload(
      JSON.stringify({
        type: "orchestrate",
        goalTitle: "Title",
        project: "p",
        projectDir: "/p",
      }),
    );
    expect(result1.ok).toBe(false);

    // Missing projectDir
    const result2 = parseIntakePayload(
      JSON.stringify({
        type: "orchestrate",
        goal: "g",
        goalTitle: "t",
        project: "p",
      }),
    );
    expect(result2.ok).toBe(false);
  });

  it("accepts type=orchestrate (backward compatible with OrchestratorPayload)", () => {
    const msg = JSON.stringify({
      type: "orchestrate",
      goal: "Refactor auth module",
      goalTitle: "Auth refactor",
      project: "core",
      projectDir: "/projects/core",
      constraints: {
        maxTasks: 10,
        preferredCapabilities: ["coding"],
        sideEffectPolicy: "ask-irreversible",
      },
    });

    const result = parseIntakePayload(msg);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.payload.type).toBe("orchestrate");
    expect(result.payload.constraints?.maxTasks).toBe(10);
    expect(result.payload.constraints?.preferredCapabilities).toEqual(["coding"]);
    expect(result.payload.constraints?.sideEffectPolicy).toBe("ask-irreversible");
  });

  it("placementOverride field allows user to specify a different project (PPL-03)", () => {
    const msg = JSON.stringify({
      type: "orchestrate",
      goal: "Add logging",
      goalTitle: "Logging",
      project: "auto-detected",
      projectDir: "/projects/auto-detected",
      placementOverride: {
        action: "new",
        projectName: "user-chosen",
        projectDir: "/projects/user-chosen",
      },
    });

    const result = parseIntakePayload(msg);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.payload.placementOverride?.action).toBe("new");
    expect(result.payload.placementOverride?.projectName).toBe("user-chosen");
    expect(result.payload.placementOverride?.projectDir).toBe("/projects/user-chosen");
  });
});

describe("buildIntakePayload", () => {
  it("constructs a valid payload from parts", () => {
    const payload = buildIntakePayload({
      goal: "Deploy to production",
      goalTitle: "Production deploy",
      project: "infra",
      projectDir: "/projects/infra",
      templateName: "deploy-template",
      templateParams: { env: "production" },
      synthesize: false,
      artifactType: "workflow",
    });

    expect(payload.type).toBe("orchestrate");
    expect(payload.goal).toBe("Deploy to production");
    expect(payload.goalTitle).toBe("Production deploy");
    expect(payload.project).toBe("infra");
    expect(payload.projectDir).toBe("/projects/infra");
    expect(payload.templateName).toBe("deploy-template");
    expect(payload.templateParams).toEqual({ env: "production" });
    expect(payload.synthesize).toBe(false);
    expect(payload.artifactType).toBe("workflow");
  });

  it("constructs a minimal payload without optional fields", () => {
    const payload = buildIntakePayload({
      goal: "Quick fix",
      goalTitle: "Fix it",
      project: "misc",
      projectDir: "/projects/misc",
    });

    expect(payload.type).toBe("orchestrate");
    expect(payload.goal).toBe("Quick fix");
    expect(payload.templateName).toBeUndefined();
    expect(payload.templateParams).toBeUndefined();
    expect(payload.synthesize).toBeUndefined();
    expect(payload.placementOverride).toBeUndefined();
    expect(payload.artifactType).toBeUndefined();
  });
});
