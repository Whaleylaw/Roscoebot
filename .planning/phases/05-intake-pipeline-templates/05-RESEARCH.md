# Phase 5: Intake Pipeline & Templates - Research

**Researched:** 2026-03-29
**Domain:** Intake conversation flow, project placement, workflow templates, workflow synthesis
**Confidence:** HIGH

## Summary

Phase 5 delivers the intake pipeline that turns natural language user input into structured orchestration artifacts. The phase has four distinct subsystems: (1) an intake skill -- a markdown instruction set any agent follows to guide clarification and determine what to create, (2) project placement logic that reads PROJECT.md summaries and uses LLM reasoning to suggest where work belongs, (3) a three-tier workflow template system with bundled/global/project-local lookup, and (4) workflow synthesis that generates workflows from scratch when no template matches.

All four subsystems build on existing primitives. The orchestrator already accepts structured payloads via `orchestrateGoal()` and `parseOrchestratorPayload()`. The `ProjectManager` already creates projects, sub-projects, and workflows. The `generateWorkflowMd()` function already produces WF-NNN.md files with frontmatter. The intake pipeline's job is to produce the structured input that feeds these existing functions -- it is the upstream funnel, not a replacement.

The paralegal workspace (`workspace-paralegal/FirmVault/skills.tools.workflows/`) provides a rich real-world reference for template structure: workflows reference skills, skills reference tools and document templates, workflows have triggers, per-item iteration, and prerequisites. The template schema must accommodate this layering while also supporting simpler ad-hoc workflows. The bundled templates (code feature, research report, ops runbook) will be simpler than the paralegal examples but use the same structural format.

**Primary recommendation:** Build the intake skill as a markdown file shipped with the package (like `orchestrator-templates.ts` static strings), the template system as a Zod-validated schema with three-tier filesystem lookup, and workflow synthesis as an LLM prompt that outputs the same schema. Keep the intake skill and template system decoupled -- the skill produces a structured handoff, templates are a resolution mechanism within that handoff.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- D-01: "Goal" is NOT a system entity. It's simply the user's natural language input.
- D-02: Don't assume, clarify. Unless unambiguous, reflect interpretation and get confirmation.
- D-03: Output can be any artifact -- task, workflow, or project.
- D-04: LLM-driven placement. No keyword heuristics or algorithmic matching.
- D-05: User drives project decisions. Never auto-place.
- D-06: Sub-project creation only when user explicitly requests it.
- D-07: User can override any placement per PPL-03.
- D-08: The user's agent runs intake, not the orchestrator. Orchestrator never talks to user directly.
- D-09: Natural conversation trigger only. No dedicated CLI command.
- D-10: Intake skill (markdown instruction set) defines the conversational process.
- D-11: Intake determines four things: artifact type, project placement, template match, key parameters.
- D-12: Templates span rigid/procedural to structural/flexible.
- D-13: Three-tier template lookup: project-local, global, bundled.
- D-14: Bundled defaults: code feature, research report, ops runbook.
- D-15: Template creation is conversational via a dedicated skill/workflow.
- D-16: Synthesized workflows follow same structure as templates.
- D-17: Workflow templates reference skills, tools, and document templates (layered composition).
- D-18: Parameterization varies -- frontmatter params for workflows, placeholder tokens for documents.
- D-19: Templates support triggers, per-item execution, prerequisites, related skills/tools.
- D-20: Orchestrator generates workflow from scratch when no template matches.
- D-21: Synthesized workflows match template format -- same frontmatter, step format.
- D-22: Save as template after success -- strip project-specific values, save to appropriate tier.

### Claude's Discretion
- Intake skill content and conversational prompts
- Template creation skill/workflow design
- Bundled template content beyond the three required types
- LLM prompt engineering for project placement and workflow synthesis
- Internal implementation of three-tier template lookup
- How the agent determines when input is "unambiguous enough" to skip clarification

### Deferred Ideas (OUT OF SCOPE)
- Template versioning
- Template marketplace/sharing
- Automated template suggestion before workflow completion
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| PPL-01 | Orchestrator determines whether work belongs in existing project, new project, or sub-project | LLM-driven placement via `listProjects()` PROJECT.md summaries; intake skill produces placement recommendation |
| PPL-02 | Project placement uses heuristics: keyword/capability match against active projects, scope similarity | CONTEXT.md D-04 overrides this to LLM-driven (no keyword heuristics). Use LLM reasoning on PROJECT.md summaries |
| PPL-03 | User can override automatic project placement | Intake skill always proposes and asks; user confirms or redirects |
| TPL-01 | Reusable workflow templates exist as markdown files with parameterized frontmatter | Extended WorkflowTemplateFrontmatterSchema with params, triggers, per_item, related_skills, related_tools |
| TPL-02 | Templates cover common work types (code feature, research report, ops runbook) | Three bundled templates shipped as static strings (pattern: `orchestrator-templates.ts`) |
| TPL-03 | Orchestrator matches user goals to templates and configures them for specific request | LLM-driven template matching: intake skill collects goal + params, template resolver searches three tiers |
| SYN-01 | When no template matches, orchestrator generates a tailored workflow from natural language goal | LLM synthesis prompt generates WorkflowTemplateFrontmatter-shaped output |
| SYN-02 | Synthesized workflows follow same structure as templates (frontmatter + tasks + dependencies) | Shared schema enforced by Zod validation; same `generateWorkflowMd()` code path |
| SYN-03 | Generated workflows are written to disk before execution begins (not ephemeral) | `writeFileAtomic()` to `workflows/WF-NNN.md` before `orchestrateGoal()` activation |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| zod | ^4.3.6 | Template frontmatter schema validation | Already used for all frontmatter schemas in `schemas.ts` |
| yaml | ^2.8.3 | YAML frontmatter serialization/parsing | Already used by `templates.ts` and `frontmatter.ts` |
| node:fs/promises | built-in | Template file discovery and three-tier lookup | Already used throughout `src/projects/` |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| node:path | built-in | Path resolution for template tiers | Three-tier lookup paths |
| node:os | built-in | `os.homedir()` for global template dir | `~/.openclaw/templates/` resolution |

No new dependencies required. Phase 5 uses only existing project dependencies.

## Architecture Patterns

### Recommended Project Structure
```
src/projects/
  intake-skill.ts           # Static intake skill markdown content (like orchestrator-templates.ts)
  template-schema.ts        # WorkflowTemplateFrontmatterSchema (extends WorkflowFrontmatterSchema)
  template-resolver.ts      # Three-tier lookup + template listing
  template-bundled.ts       # Static bundled template content (code-feature, research, ops-runbook)
  template-save.ts          # Save synthesized workflow as reusable template
  intake-payload.ts         # Extended OrchestratorPayload with template/placement fields
  placement.ts              # Project placement helpers (list active projects, format for LLM)
  intake-skill.test.ts
  template-schema.test.ts
  template-resolver.test.ts
  template-bundled.test.ts
  template-save.test.ts
  intake-payload.test.ts
  placement.test.ts
```

### Pattern 1: Intake Skill as Static Markdown
**What:** Ship the intake skill as a static string constant, identical to `orchestrator-templates.ts` pattern.
**When to use:** Always -- the intake skill is a markdown instruction set, not executable code.
**Example:**
```typescript
// Source: src/agents/orchestrator-templates.ts pattern
export const INTAKE_SKILL_MD = `# Intake Skill

## When to Activate
When the user describes work to be done...

## Clarification Flow
1. Reflect your interpretation back...
2. Determine artifact type (task, workflow, project)...
3. Determine project placement...
4. Match or synthesize template...

## Handoff
Produce a structured JSON payload for sessions_send...
`;

export function getIntakeSkillContent(): string {
  return INTAKE_SKILL_MD;
}
```

### Pattern 2: Extended Template Frontmatter Schema
**What:** Extend `WorkflowFrontmatterSchema` with template-specific fields (params, triggers, per_item, related_skills, related_tools).
**When to use:** For template files (not generated workflow instances).
**Example:**
```typescript
// Extends the existing WorkflowFrontmatterSchema from schemas.ts
export const WorkflowTemplateFrontmatterSchema = z.object({
  name: z.string(),
  description: z.string(),
  // Template-specific fields (D-19)
  params: z.record(z.string(), z.object({
    type: z.enum(["string", "string[]", "boolean", "number"]),
    description: z.string().optional(),
    required: z.boolean().default(true),
    default: z.unknown().optional(),
  })).default({}),
  related_skills: z.array(z.string()).default([]),
  related_tools: z.array(z.string()).default([]),
  templates: z.array(z.string()).default([]),
  triggered_by: z.array(z.string()).default([]),
  repeatable: z.boolean().default(false),
  per_item: z.string().nullable().default(null),
  prerequisites: z.array(z.string()).default([]),
  // Steps define the workflow structure
  steps: z.array(z.object({
    id: z.string(),
    title: z.string(),
    owner: z.enum(["agent", "user", "mixed"]).default("agent"),
    description: z.string().optional(),
    capabilities: z.array(z.string()).default([]),
    depends_on: z.array(z.string()).default([]),
    verification_type: z.enum(["automatic", "human", "external", "mixed"]).default("automatic"),
    side_effect_class: z.enum(["none", "reversible", "irreversible"]).default("none"),
  })).default([]),
});
```

### Pattern 3: Three-Tier Template Resolution
**What:** Search project-local, then global, then bundled templates. First match wins.
**When to use:** Whenever the system needs to find a template by name or match a goal to templates.
**Example:**
```typescript
// Three-tier lookup: project-local > global > bundled
export async function resolveTemplate(
  templateName: string,
  projectDir: string | null,
): Promise<ResolvedTemplate | null> {
  // Tier 1: project-local
  if (projectDir) {
    const localPath = path.join(projectDir, "templates", `${templateName}.md`);
    const result = await tryReadTemplate(localPath);
    if (result) return { ...result, tier: "project" };
  }
  // Tier 2: global
  const globalPath = path.join(os.homedir(), ".openclaw", "templates", `${templateName}.md`);
  const globalResult = await tryReadTemplate(globalPath);
  if (globalResult) return { ...globalResult, tier: "global" };
  // Tier 3: bundled
  const bundled = getBundledTemplate(templateName);
  if (bundled) return { ...bundled, tier: "bundled" };
  return null;
}
```

### Pattern 4: Intake Produces OrchestratorPayload
**What:** The intake skill's final output is an extended `OrchestratorPayload` sent via `sessions_send`.
**When to use:** After intake clarification is complete -- the agent constructs and sends this payload.
**Example:**
```typescript
// Extended payload type for intake-produced work
export type IntakePayload = OrchestratorPayload & {
  templateName?: string;     // matched template (if any)
  templateParams?: Record<string, unknown>; // template parameter values
  synthesize?: boolean;      // true when no template matched, synthesis needed
};
```

### Anti-Patterns to Avoid
- **Hardcoded intake logic in a specific agent:** The intake skill is a markdown instruction set any agent can follow (D-10). Do not put intake conversation logic in agent-specific code.
- **Keyword-based project matching:** D-04 explicitly mandates LLM-driven placement. No regex, fuzzy matching, or keyword scoring.
- **Template-as-code:** Templates are markdown files with YAML frontmatter, not TypeScript classes or configuration objects. The system reads/writes them as files.
- **Separate workflow format for synthesized vs. template-sourced:** D-16/D-21 require identical structure. One schema, one code path.
- **Auto-placing work without confirmation:** D-05/D-07 require user confirmation for every placement decision.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| YAML frontmatter parsing | Custom regex parser | Existing `extractYamlBlock()` + `YAML.parse()` + Zod | Already battle-tested in `frontmatter.ts` |
| Workflow file creation | Direct file writes | `generateWorkflowMd()` + `writeFileAtomic()` | Atomic writes, schema validation, consistent format |
| Project creation | Direct mkdir + file writes | `ProjectManager.create()` / `.createSubProject()` | Handles atomicity, scaffold, edge cases |
| Sequential ID generation | Counter files or timestamps | `ProjectManager.nextWorkflowId()` / `.nextTaskId()` | Already scans directory for max ID |
| Project listing for placement | Custom directory walk | `ProjectGatewayService.listProjects()` or `ProjectSyncService.discoverProjects()` | Already discovers projects + reads index data |
| Template validation | Manual field checking | Zod schema `.safeParse()` | Consistent with all other frontmatter validation |

**Key insight:** The entire file I/O and validation layer already exists in `src/projects/`. Phase 5 adds template discovery and intake logic on top -- it should not reimplement any file manipulation primitives.

## Common Pitfalls

### Pitfall 1: Conflating Intake Skill with Orchestrator Logic
**What goes wrong:** Putting template matching, synthesis, or task creation code in the intake skill.
**Why it happens:** The intake skill determines "what to create" and the orchestrator "creates it" -- the boundary feels blurry.
**How to avoid:** The intake skill produces a structured JSON payload. The orchestrator receives and executes it. The skill is instructions (markdown), not code.
**Warning signs:** If the intake skill references `orchestrateGoal()` or file system operations, the boundary is wrong.

### Pitfall 2: Template Schema Incompatible with Existing Workflow Schema
**What goes wrong:** Template frontmatter has different field names or types than `WorkflowFrontmatterSchema`, causing generated workflows to fail validation.
**Why it happens:** Template schema is designed independently of the workflow instance schema.
**How to avoid:** Template schema is a superset -- it has additional fields (params, triggers, related_skills) but the core fields match `WorkflowFrontmatterSchema`. When a template is instantiated, the template-specific fields are stripped and the result passes `WorkflowFrontmatterSchema.parse()`.
**Warning signs:** Generated workflow files fail `parseWorkflowFrontmatter()`.

### Pitfall 3: Bundled Templates Hardcoded Without Validation
**What goes wrong:** Bundled template strings are just markdown without schema validation, so they drift from the schema over time.
**Why it happens:** Static strings feel "safe" because they are constants.
**How to avoid:** Parse bundled templates through `WorkflowTemplateFrontmatterSchema` in tests (like `templates.test.ts` round-trip pattern).
**Warning signs:** Bundled template frontmatter has fields not in the schema or missing required fields.

### Pitfall 4: Three-Tier Lookup Ignores Missing Directories
**What goes wrong:** `fs.readdir()` throws ENOENT when `templates/` directory does not exist in a project or global location.
**Why it happens:** Not all projects have a `templates/` directory; global templates directory may not exist yet.
**How to avoid:** Catch ENOENT gracefully and move to next tier. Use `try/catch` pattern consistent with `ProjectManager.nextWorkflowId()`.
**Warning signs:** Template resolution crashes on fresh installs or projects without templates.

### Pitfall 5: LLM Prompt for Placement Returns Unstructured Output
**What goes wrong:** The LLM returns free-text reasoning instead of a structured placement decision, requiring fragile text parsing.
**Why it happens:** Prompt does not specify output format clearly.
**How to avoid:** Use structured output format (JSON) in the prompt. The intake skill already produces JSON payloads -- placement should follow the same pattern. Include example output in the prompt.
**Warning signs:** Regex parsing of LLM output for project names or placement decisions.

### Pitfall 6: NotifyUser Stub Left Unwired
**What goes wrong:** Phase 4 created `defaultNotifyUser` as a log-only stub with a TODO to wire to `sessions_send` in Phase 5. If not addressed, escalation notifications are silently logged instead of reaching the user.
**Why it happens:** The TODO is in `recovery-manager.ts` and easy to forget when focused on intake/template work.
**How to avoid:** Include an explicit task to wire `NotifyUserFn` to gateway `sessions_send`. The recovery manager already accepts `{ notifyUser }` in its deps parameter.
**Warning signs:** `grep -r "stub.*sessions_send" src/projects/recovery-manager.ts` still returns matches after phase completion.

## Code Examples

### Existing Template Generation (extend this)
```typescript
// Source: src/projects/templates.ts
export function generateWorkflowMd(opts: {
  id: string;
  title: string;
  goal: string;
  tasks?: string[];
  template?: string;     // <-- already supports template source reference
  goalCheck?: string;
}): string {
  const today = new Date().toISOString().split("T")[0];
  const data = WorkflowFrontmatterSchema.parse({ ... });
  const yaml = YAML.stringify(data, { schema: "core" });
  return `---\n${yaml}---\n\n## Goal\n\n${opts.goal}\n\n## Steps\n\n## Notes\n`;
}
```

### Existing Orchestrator Payload (extend this)
```typescript
// Source: src/projects/orchestrator.ts
export type OrchestratorPayload = {
  type: "orchestrate";
  goal: string;
  goalTitle: string;
  project: string;
  projectDir: string;
  constraints?: { ... };
};
// Extend with: templateName?, templateParams?, synthesize?
```

### Existing Project Listing (reuse for placement)
```typescript
// Source: src/gateway/server-projects.ts
async listProjects(): Promise<Array<{ name: string } & ProjectIndex>> {
  const projectDirs = await this.syncService.discoverProjects();
  // Returns project name + index data for LLM placement context
}
```

### Real Workflow Template Structure (reference from paralegal system)
```yaml
# Source: workspace-paralegal request_records_bills/workflow.md
---
name: request_records_bills
description: >
  Request medical records and bills from healthcare providers.
phase: treatment
workflow_id: request_records_bills
related_skills:
  - skills/medical-records-request/skill.md
related_tools:
  - tools/read_pdf.py
templates:
  - templates/2022 Whaley Medical Record Request (URR) (1).docx
triggered_by:
  - provider_treatment_complete
  - demand_preparation
repeatable: true
per_item: medical_providers
---
# Request Records & Bills Workflow
## Prerequisites
- Provider exists in the graph
- HIPAA authorization signed
## Workflow Steps
### Step 1: Prepare Records Request
...
```

### NotifyUser Wiring Pattern
```typescript
// Source: src/projects/recovery-manager.ts (wire this in Phase 5)
export type NotifyUserFn = (opts: {
  taskId: string;
  workflowId: string | null;
  failureCategory: FailureCategory;
  failureReason: string;
  recoveryAttempts: number;
  sessionKey?: string;
}) => Promise<void>;

// Currently defaultNotifyUser is log-only stub.
// Wire to sessions_send via gateway RPC.
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Orchestrator receives pre-formed payload | Intake skill guides conversation then produces payload | Phase 5 | Upstream funnel added; orchestrateGoal() interface unchanged |
| No template system | Three-tier template lookup with bundled defaults | Phase 5 | New schema, new files, new resolution logic |
| NotifyUser is log-only stub | NotifyUser wired to sessions_send | Phase 5 | Escalation notifications reach users |

## Open Questions

1. **How does the intake skill get injected into agents?**
   - What we know: The `project-context-hook.ts` pattern injects PROJECT.md into agent bootstrap. Skills are loaded from workspace directories.
   - What's unclear: Whether the intake skill should be injected via bootstrap hook, workspace file, or on-demand loading.
   - Recommendation: Ship as a workspace bootstrap file (like AGENTS.md/SOUL.md) so it is available to all agents at session start. The intake skill content is small enough (~2KB) to not impact bootstrap size.

2. **Template listing for LLM matching**
   - What we know: Three tiers need to be searched. Each tier returns template names and descriptions.
   - What's unclear: Whether the LLM receives full template content or just name+description summaries for matching.
   - Recommendation: Pass name + description + params summary only. Full template content is loaded after match is confirmed. This keeps LLM context lean.

3. **Save-as-template location selection**
   - What we know: D-22 says save to "appropriate location (project-local or global)."
   - What's unclear: How the agent decides which tier to save to.
   - Recommendation: Default to project-local if the workflow was in a project context, otherwise global. Let the user override via the conversational template creation flow (D-15).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest 4.1.0+ |
| Config file | `vitest.config.ts` |
| Quick run command | `pnpm test -- src/projects/template-schema.test.ts -x` |
| Full suite command | `pnpm test` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PPL-01 | Placement helper returns existing/new/sub-project recommendation | unit | `pnpm test -- src/projects/placement.test.ts -x` | Wave 0 |
| PPL-02 | Placement uses LLM (no keyword heuristics) -- format verification | unit | `pnpm test -- src/projects/placement.test.ts -x` | Wave 0 |
| PPL-03 | Extended payload accepts user override for placement | unit | `pnpm test -- src/projects/intake-payload.test.ts -x` | Wave 0 |
| TPL-01 | Template frontmatter schema validates correctly | unit | `pnpm test -- src/projects/template-schema.test.ts -x` | Wave 0 |
| TPL-02 | Bundled templates parse and cover three work types | unit | `pnpm test -- src/projects/template-bundled.test.ts -x` | Wave 0 |
| TPL-03 | Three-tier lookup finds templates in correct precedence order | unit | `pnpm test -- src/projects/template-resolver.test.ts -x` | Wave 0 |
| SYN-01 | Synthesized workflow output matches template schema | unit | `pnpm test -- src/projects/template-schema.test.ts -x` | Wave 0 |
| SYN-02 | Synthesized workflows use same frontmatter structure | unit | `pnpm test -- src/projects/template-schema.test.ts -x` | Wave 0 |
| SYN-03 | Workflow files written to disk before execution | unit | `pnpm test -- src/projects/orchestrator.test.ts -x` | Existing (extend) |

### Sampling Rate
- **Per task commit:** `pnpm test -- src/projects/<touched-file>.test.ts -x`
- **Per wave merge:** `pnpm test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `src/projects/template-schema.test.ts` -- covers TPL-01, SYN-01, SYN-02
- [ ] `src/projects/template-resolver.test.ts` -- covers TPL-03
- [ ] `src/projects/template-bundled.test.ts` -- covers TPL-02
- [ ] `src/projects/placement.test.ts` -- covers PPL-01, PPL-02
- [ ] `src/projects/intake-payload.test.ts` -- covers PPL-03
- [ ] `src/projects/template-save.test.ts` -- covers D-22 save-as-template

## Project Constraints (from CLAUDE.md)

- **Language:** TypeScript ESM, strict typing, no `any`
- **Formatting:** oxlint + oxfmt (`pnpm check`, `pnpm format`)
- **Testing:** vitest with forks pool only, colocated `*.test.ts`, 70% coverage thresholds
- **File naming:** kebab-case, `.test.ts` suffix
- **Imports:** explicit `.js` extensions, `import type` for type-only
- **Schema:** Zod for validation (not Typebox -- Typebox is for tool schemas only)
- **File I/O:** Use `writeFileAtomic()` from `scaffold.ts` for all file writes
- **Error handling:** `{ ok: true; ... } | { ok: false; error: string }` for expected failures
- **Commit tool:** `scripts/committer "<msg>" <file...>`
- **No new deps without approval**
- **Files under ~700 LOC**
- **GSD workflow:** Work through GSD commands, not direct edits

## Sources

### Primary (HIGH confidence)
- `src/projects/orchestrator.ts` -- existing orchestrateGoal pipeline, DecomposedTask type, payload parsing
- `src/projects/scaffold.ts` -- ProjectManager with create/createSubProject/nextWorkflowId
- `src/projects/templates.ts` -- generateWorkflowMd, generateTaskMd patterns
- `src/projects/schemas.ts` -- WorkflowFrontmatterSchema, TaskFrontmatterSchema
- `src/projects/frontmatter.ts` -- parseAndValidate pattern, extractYamlBlock
- `src/projects/recovery-manager.ts` -- NotifyUserFn type and defaultNotifyUser stub
- `src/agents/orchestrator-templates.ts` -- static workspace template content pattern
- `src/agents/project-context-hook.ts` -- bootstrap file injection pattern
- `src/gateway/server-projects.ts` -- listProjects() for project discovery
- Paralegal workflow system (`workspace-paralegal/`) -- real template/skill/tool layering reference

### Secondary (MEDIUM confidence)
- `.planning/phases/05-intake-pipeline-templates/05-CONTEXT.md` -- all locked decisions

### Tertiary (LOW confidence)
- None

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- no new dependencies, all existing libraries
- Architecture: HIGH -- extends existing patterns (orchestrator-templates.ts, schemas.ts, frontmatter.ts)
- Pitfalls: HIGH -- derived from direct code reading of existing error handling and validation patterns

**Research date:** 2026-03-29
**Valid until:** 2026-04-28 (stable domain, internal system)
