import type { OrchestratorPayload } from "./orchestrator.js";

/**
 * Extended payload for the intake pipeline. Carries template, placement,
 * synthesis, and artifact type fields through the orchestration pipeline.
 *
 * Backward-compatible: a standard OrchestratorPayload (without intake fields)
 * also parses successfully as an IntakePayload.
 */
export type IntakePayload = OrchestratorPayload & {
  /** Matched template name from three-tier lookup (undefined if no match) */
  templateName?: string;
  /** Template parameter values filled during intake clarification */
  templateParams?: Record<string, unknown>;
  /** True when no template matched and workflow synthesis is needed (SYN-01) */
  synthesize?: boolean;
  /** User override for project placement per PPL-03 / D-07 */
  placementOverride?: {
    action: "existing" | "new";
    projectName?: string;
    projectDir?: string;
  };
  /** Artifact type determined during intake (D-03, D-11) */
  artifactType?: "task" | "workflow" | "project";
};

export type ParseIntakePayloadResult =
  | { ok: true; payload: IntakePayload }
  | { ok: false; error: string };

/**
 * Validate and extract a structured IntakePayload from a JSON string.
 *
 * Backward-compatible with OrchestratorPayload: messages without intake-specific
 * fields parse successfully with those fields left undefined.
 */
export function parseIntakePayload(message: string): ParseIntakePayloadResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(message);
  } catch {
    return { ok: false, error: "Message is not valid JSON" };
  }

  if (typeof parsed !== "object" || parsed === null) {
    return { ok: false, error: "Message is not a JSON object" };
  }

  const obj = parsed as Record<string, unknown>;

  if (obj.type !== "orchestrate") {
    return { ok: false, error: `Unknown payload type: ${String(obj.type)}` };
  }
  if (typeof obj.goal !== "string" || obj.goal.length === 0) {
    return { ok: false, error: "Missing or empty 'goal' field" };
  }
  if (typeof obj.goalTitle !== "string" || obj.goalTitle.length === 0) {
    return { ok: false, error: "Missing or empty 'goalTitle' field" };
  }
  if (typeof obj.project !== "string" || obj.project.length === 0) {
    return { ok: false, error: "Missing or empty 'project' field" };
  }
  if (typeof obj.projectDir !== "string" || obj.projectDir.length === 0) {
    return { ok: false, error: "Missing or empty 'projectDir' field" };
  }

  const payload: IntakePayload = {
    type: "orchestrate",
    goal: obj.goal,
    goalTitle: obj.goalTitle,
    project: obj.project,
    projectDir: obj.projectDir,
  };

  // Parse optional constraints (backward compat with OrchestratorPayload)
  if (obj.constraints && typeof obj.constraints === "object") {
    const c = obj.constraints as Record<string, unknown>;
    payload.constraints = {};
    if (typeof c.maxTasks === "number") payload.constraints.maxTasks = c.maxTasks;
    if (Array.isArray(c.preferredCapabilities)) {
      payload.constraints.preferredCapabilities = c.preferredCapabilities.filter(
        (v): v is string => typeof v === "string",
      );
    }
    if (
      typeof c.sideEffectPolicy === "string" &&
      ["auto", "ask-irreversible", "ask-all"].includes(c.sideEffectPolicy)
    ) {
      payload.constraints.sideEffectPolicy = c.sideEffectPolicy as
        | "auto"
        | "ask-irreversible"
        | "ask-all";
    }
  }

  // Parse optional intake-specific fields
  if (typeof obj.templateName === "string") {
    payload.templateName = obj.templateName;
  }

  if (obj.templateParams && typeof obj.templateParams === "object" && !Array.isArray(obj.templateParams)) {
    payload.templateParams = obj.templateParams as Record<string, unknown>;
  }

  if (typeof obj.synthesize === "boolean") {
    payload.synthesize = obj.synthesize;
  }

  if (obj.placementOverride && typeof obj.placementOverride === "object") {
    const po = obj.placementOverride as Record<string, unknown>;
    if (typeof po.action === "string" && (po.action === "existing" || po.action === "new")) {
      payload.placementOverride = { action: po.action };
      if (typeof po.projectName === "string") {
        payload.placementOverride.projectName = po.projectName;
      }
      if (typeof po.projectDir === "string") {
        payload.placementOverride.projectDir = po.projectDir;
      }
    }
  }

  if (
    typeof obj.artifactType === "string" &&
    ["task", "workflow", "project"].includes(obj.artifactType)
  ) {
    payload.artifactType = obj.artifactType as "task" | "workflow" | "project";
  }

  return { ok: true, payload };
}

/**
 * Convenience builder that constructs a valid IntakePayload with type="orchestrate".
 */
export function buildIntakePayload(opts: {
  goal: string;
  goalTitle: string;
  project: string;
  projectDir: string;
  templateName?: string;
  templateParams?: Record<string, unknown>;
  synthesize?: boolean;
  placementOverride?: IntakePayload["placementOverride"];
  artifactType?: IntakePayload["artifactType"];
  constraints?: OrchestratorPayload["constraints"];
}): IntakePayload {
  const payload: IntakePayload = {
    type: "orchestrate",
    goal: opts.goal,
    goalTitle: opts.goalTitle,
    project: opts.project,
    projectDir: opts.projectDir,
  };

  if (opts.constraints !== undefined) payload.constraints = opts.constraints;
  if (opts.templateName !== undefined) payload.templateName = opts.templateName;
  if (opts.templateParams !== undefined) payload.templateParams = opts.templateParams;
  if (opts.synthesize !== undefined) payload.synthesize = opts.synthesize;
  if (opts.placementOverride !== undefined) payload.placementOverride = opts.placementOverride;
  if (opts.artifactType !== undefined) payload.artifactType = opts.artifactType;

  return payload;
}
