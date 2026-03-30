import fs from "node:fs/promises";
import path from "node:path";
import { parseProjectFrontmatter } from "./frontmatter.js";

/**
 * Condensed summary of a project for LLM-based placement reasoning.
 * Contains only the fields relevant to deciding where new work belongs.
 */
export type ProjectSummary = {
  name: string;
  description: string;
  status: string;
  tags: string[];
  capabilities: string[];
  projectDir: string;
};

/**
 * The result of LLM placement reasoning: where should new work go?
 * The LLM populates this after reviewing project summaries (D-04: no keyword heuristics).
 */
export type PlacementSuggestion = {
  action: "existing" | "new";
  /** Name of existing project, or null for new */
  projectName: string | null;
  /** Dir of existing project, or null for new */
  projectDir: string | null;
  /** LLM-generated explanation for the agent to present */
  rationale: string;
};

/**
 * Read PROJECT.md files from a list of project directories and return
 * summaries for active projects only (excludes paused and complete).
 */
export async function readProjectSummaries(projectDirs: string[]): Promise<ProjectSummary[]> {
  const summaries: ProjectSummary[] = [];

  for (const projectDir of projectDirs) {
    const projectMdPath = path.join(projectDir, "PROJECT.md");
    let content: string;
    try {
      content = await fs.readFile(projectMdPath, "utf-8");
    } catch {
      // Skip directories without a readable PROJECT.md
      continue;
    }

    const parsed = parseProjectFrontmatter(content, projectMdPath);
    if (!parsed.success) {
      continue;
    }

    // Filter to active projects only
    if (parsed.data.status !== "active") {
      continue;
    }

    summaries.push({
      name: parsed.data.name,
      description: parsed.data.description ?? "",
      status: parsed.data.status,
      tags: parsed.data.tags,
      capabilities: parsed.data.allowed_capabilities,
      projectDir,
    });
  }

  return summaries;
}

/**
 * Format project summaries as structured text for inclusion in an LLM prompt.
 *
 * Per D-04: NO keyword heuristics, NO algorithmic scoring. This function only
 * formats data for LLM consumption. The LLM in the intake skill does the reasoning.
 */
export function formatProjectsForPlacement(summaries: ProjectSummary[]): string {
  if (summaries.length === 0) {
    return "No active projects found. This work will need a new project.";
  }

  const blocks: string[] = [];
  for (const s of summaries) {
    const lines = [
      `Project: ${s.name}`,
      `Description: ${s.description}`,
      `Tags: ${s.tags.length > 0 ? s.tags.join(", ") : "none"}`,
      `Capabilities: ${s.capabilities.length > 0 ? s.capabilities.join(", ") : "none"}`,
      "---",
    ];
    blocks.push(lines.join("\n"));
  }

  return blocks.join("\n");
}
