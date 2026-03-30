import { parseTemplateFrontmatter } from "./template-schema.js";

/**
 * Bundled workflow templates shipped with the package.
 * Keys are template names, values are full markdown strings with YAML frontmatter.
 * Following the static string constant pattern from orchestrator-templates.ts (D-08).
 */

const CODE_FEATURE_TEMPLATE = `---
name: code-feature
description: "Implement a code feature: design, implement, test, and verify"
params:
  feature_name:
    type: string
    description: Name of the feature
    required: true
  codebase_context:
    type: string
    description: Relevant codebase areas
    required: false
    default: ""
steps:
  - id: design
    title: Design the feature
    owner: agent
    capabilities:
      - code
    verification_type: human
  - id: implement
    title: Implement the feature
    owner: agent
    capabilities:
      - code
    depends_on:
      - design
    verification_type: automatic
  - id: test
    title: Write and run tests
    owner: agent
    capabilities:
      - code
    depends_on:
      - implement
    verification_type: automatic
  - id: verify
    title: Manual verification
    owner: user
    depends_on:
      - test
    verification_type: human
---

# Code Feature Workflow

## Design

Design the feature based on the goal and codebase context. Produce a brief design document
covering approach, affected files, and edge cases.

## Implement

Implement the feature following the design. Keep changes focused and well-structured.

## Test

Write tests that cover the new behavior. Run existing tests to check for regressions.

## Verify

Manual verification that the feature works as intended in context.
`;

const RESEARCH_REPORT_TEMPLATE = `---
name: research-report
description: Research a topic and produce a structured report with findings
params:
  topic:
    type: string
    description: Research topic
    required: true
  depth:
    type: string
    description: "Research depth (shallow, standard, deep)"
    required: false
    default: standard
steps:
  - id: gather
    title: Gather sources and information
    owner: agent
    capabilities:
      - research
    verification_type: automatic
  - id: analyze
    title: Analyze and synthesize findings
    owner: agent
    capabilities:
      - research
    depends_on:
      - gather
    verification_type: automatic
  - id: draft
    title: Draft the report
    owner: agent
    capabilities:
      - research
    depends_on:
      - analyze
    verification_type: human
  - id: review
    title: Review and finalize
    owner: user
    depends_on:
      - draft
    verification_type: human
---

# Research Report Workflow

## Gather

Collect relevant sources, data, and information on the topic. Cast a wide net initially,
then filter for quality and relevance.

## Analyze

Synthesize gathered information into key findings. Identify patterns, contradictions,
and gaps in the research.

## Draft

Write a structured report with executive summary, findings, analysis, and recommendations.

## Review

Human review of the final report for accuracy, completeness, and clarity.
`;

const OPS_RUNBOOK_TEMPLATE = `---
name: ops-runbook
description: Execute an operational procedure with safety checks and verification
params:
  service:
    type: string
    description: Target service or system
    required: true
  operation:
    type: string
    description: Operation to perform
    required: true
steps:
  - id: preflight
    title: Pre-flight checks
    owner: agent
    capabilities:
      - ops
    verification_type: automatic
  - id: execute
    title: Execute the operation
    owner: agent
    capabilities:
      - ops
    depends_on:
      - preflight
    side_effect_class: irreversible
    verification_type: human
  - id: verify-result
    title: Verify operation result
    owner: agent
    capabilities:
      - ops
    depends_on:
      - execute
    verification_type: automatic
---

# Ops Runbook Workflow

## Pre-flight

Run pre-flight checks: verify service health, confirm access permissions,
check for active incidents, and validate the operation parameters.

## Execute

Execute the operation with appropriate safety measures. This step has irreversible
side effects and requires human approval before proceeding.

## Verify Result

Verify the operation completed successfully by checking service health,
logs, and expected state changes.
`;

export const BUNDLED_TEMPLATES: Map<string, string> = new Map([
  ["code-feature", CODE_FEATURE_TEMPLATE],
  ["research-report", RESEARCH_REPORT_TEMPLATE],
  ["ops-runbook", OPS_RUNBOOK_TEMPLATE],
]);

/**
 * Returns a bundled template by name, or null if not found.
 */
export function getBundledTemplate(name: string): { name: string; content: string } | null {
  const content = BUNDLED_TEMPLATES.get(name);
  if (content === undefined) {
    return null;
  }
  return { name, content };
}

/** Cached parsed template list (static data, safe to cache at module level). */
let cachedList: Array<{ name: string; description: string }> | undefined;

/**
 * Returns an array of { name, description } for all bundled templates.
 * Results are cached since bundled templates are static.
 */
export function listBundledTemplates(): Array<{ name: string; description: string }> {
  if (cachedList !== undefined) {
    return cachedList;
  }

  const list: Array<{ name: string; description: string }> = [];
  for (const [name, content] of BUNDLED_TEMPLATES) {
    const result = parseTemplateFrontmatter(content);
    if (result.success) {
      list.push({ name: result.data.name, description: result.data.description });
    }
  }
  cachedList = list;
  return list;
}
