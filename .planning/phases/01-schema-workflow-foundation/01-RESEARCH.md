# Phase 1: Schema & Workflow Foundation - Research

**Researched:** 2026-03-29
**Domain:** Zod schema design, YAML frontmatter parsing, file scaffold patterns, project system extension
**Confidence:** HIGH

## Summary

Phase 1 extends the existing `src/projects/` module with workflow file support and new task frontmatter fields. The existing codebase has a clear, well-tested pattern: Zod schemas in `schemas.ts`, inferred types in `types.ts`, YAML parsing via `parseAndValidate<T>()` in `frontmatter.ts`, markdown generation in `templates.ts`, and directory scaffolding in `scaffold.ts`. Every new artifact follows this exact pattern.

The project uses Zod 4.3.6 (latest v4 line), the `yaml` package with `schema: "core"` to avoid YAML 1.1 quirks, atomic file writes via tmp+rename, and Vitest with colocated `*.test.ts` files. All new task fields must be optional with defaults so existing consumers are unaffected. The capability registry is project-level (stored in PROJECT.md frontmatter), with strict validation against registered tags.

**Primary recommendation:** Mirror every existing pattern exactly. Add `WorkflowFrontmatterSchema` to `schemas.ts`, extend `TaskFrontmatterSchema` with optional fields, add `parseWorkflowFrontmatter` to `frontmatter.ts`, add `generateWorkflowMd` to `templates.ts`, extend `ProjectManager` with `nextWorkflowId()` and workflow directory creation, and export everything through `index.ts`.

<user_constraints>

## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Workflow files use WF-NNN format with 3-digit zero-padding (WF-001, WF-042), mirroring TASK-NNN pattern. Same `nextId()` logic from `scaffold.ts` can be reused.
- **D-02:** Workflow files have YAML frontmatter + structured markdown body with defined sections (## Goal, ## Steps, ## Notes). Consistent with PROJECT.md and task file patterns.
- **D-03:** Workflows reference their tasks via an explicit task list in frontmatter: `tasks: [TASK-001, TASK-002]`. Easy to parse, validates against existing TASK_ID_PATTERN.
- **D-04:** The optional `template` field stores a template name only (e.g., `template: 'code-feature'`), resolved at runtime against a known templates directory.
- **D-05:** Workflow status is auto-derived from task states but stored in frontmatter for fast reads. The orchestrator recomputes and writes it on each heartbeat. Tasks are the source of truth; the stored status is a cache.
- **D-06:** Workflows use the same lifecycle states as tasks: draft, active, paused, completed, failed.
- **D-07:** Two completion paths exist: (1) run-through -- all tasks execute to completion; (2) goal-achieved -- an external condition is met mid-workflow and remaining tasks are cancelled/skipped.
- **D-08:** `goal` field (string, required) describes what the workflow aims to achieve. `goal_check` field (string, optional) references an external condition (landmark ID, query, file check). When `goal_check` is present, the system checks it on heartbeat and can short-circuit the workflow. When absent, completion means all tasks done.
- **D-09:** Recovery is always at the individual task level. A stuck/failed task goes back in the queue; completed tasks in the same workflow are never redone. The orchestrator heartbeats workflows the same way it heartbeats tasks.
- **D-10:** All new task fields are optional with sensible defaults so existing tasks pass validation unchanged. Defaults: `verification_type: 'automatic'`, `side_effect_class: 'none'`, `approval_required: false`, `estimated_size: 'medium'`, `execution_mode: 'auto'`.
- **D-11:** The `workflow` field on a task stores a workflow ID only (e.g., `workflow: 'WF-001'`), resolved by scanning the workflows/ directory.
- **D-12:** `estimated_size` uses t-shirt sizes: `small`, `medium`, `large`.
- **D-13:** `execution_mode` has three values: `auto` (agent handles it), `manual` (human must do it), `interactive` (agent + human collaborate).
- **D-14:** Capability tags use a project-level registry. Each project defines its valid capability tags (e.g., in PROJECT.md frontmatter or a capabilities section).
- **D-15:** Validation is strict: tasks with unregistered capability tags fail validation. This prevents typos and drift. New tags must be explicitly added to the project registry first.
- **D-16:** Standard starter tags are documented (code, research, ops, review, deploy) but each project defines its own set. No global registry.

### Claude's Discretion

- Exact structured body sections for workflow files (## Goal, ## Steps, ## Notes are directional -- Claude can refine the section list based on what downstream consumers need)
- Internal implementation details: schema organization, parser structure, test approach

### Deferred Ideas (OUT OF SCOPE)

None -- discussion stayed within phase scope

</user_constraints>

<phase_requirements>

## Phase Requirements

| ID     | Description                                                                                                                       | Research Support                                                                                                                                             |
| ------ | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| WF-01  | Workflow files (WF-NNN.md) exist as first-class entities within project directories with YAML frontmatter and markdown body       | WorkflowFrontmatterSchema + parseWorkflowFrontmatter + generateWorkflowMd following existing patterns                                                        |
| WF-02  | Workflow files have a defined lifecycle: draft, active, paused, completed, failed                                                 | `status` field as `z.enum(["draft", "active", "paused", "completed", "failed"])` with default `"draft"`                                                      |
| WF-03  | Workflow frontmatter includes: id, title, status, goal, created, updated, tasks, template                                         | All fields mapped to Zod schema fields; tasks validated against TASK_ID_PATTERN; template optional                                                           |
| WF-04  | Workflow directory (workflows/) is created within project directories alongside tasks/                                            | Extend ProjectManager.create() and createSubProject() to also create workflows/.gitkeep                                                                      |
| DEC-04 | Task frontmatter extended with: workflow, verification_type, side_effect_class, approval_required, estimated_size, execution_mode | All optional fields added to TaskFrontmatterSchema with defaults per D-10                                                                                    |
| CAP-01 | Tasks have capability tags (code, research, ops, review, deploy, etc.) that are domain-agnostic                                   | Existing `capabilities` field already on TaskFrontmatterSchema; add `allowed_capabilities` to ProjectFrontmatterSchema for registry validation per D-14/D-15 |

</phase_requirements>

## Standard Stack

### Core

| Library | Version     | Purpose                            | Why Standard                                         |
| ------- | ----------- | ---------------------------------- | ---------------------------------------------------- |
| zod     | 4.3.6       | Schema validation for frontmatter  | Already used in schemas.ts; z.infer for types        |
| yaml    | (installed) | YAML parsing with `schema: "core"` | Already used in frontmatter.ts and templates.ts      |
| vitest  | ^4.1.0      | Test framework                     | Already configured with colocated \*.test.ts pattern |

### Supporting

No additional libraries needed. This phase is pure extension of existing code using existing dependencies.

**Installation:** No new packages required.

## Architecture Patterns

### Recommended Project Structure

All changes are within `src/projects/`:

```
src/projects/
  schemas.ts          # ADD: WorkflowFrontmatterSchema, WORKFLOW_ID_PATTERN; EXTEND: TaskFrontmatterSchema, ProjectFrontmatterSchema
  types.ts            # ADD: WorkflowFrontmatter type export
  frontmatter.ts      # ADD: parseWorkflowFrontmatter()
  templates.ts        # ADD: generateWorkflowMd()
  scaffold.ts         # EXTEND: ProjectManager with nextWorkflowId(), workflows/ dir creation
  capability-registry.ts  # NEW: validateCapabilities() wrapping matchCapabilities with registry check
  index.ts            # ADD: workflow exports
  schemas.test.ts     # ADD: WorkflowFrontmatterSchema tests, extended TaskFrontmatterSchema tests
  frontmatter.test.ts # ADD: parseWorkflowFrontmatter tests
  scaffold.test.ts    # ADD: nextWorkflowId tests, workflows/ dir creation tests
  templates.test.ts   # NEW: generateWorkflowMd tests
  capability-registry.test.ts  # NEW: registry validation tests
```

### Pattern 1: Schema Extension (TaskFrontmatterSchema)

**What:** Add optional fields to the existing TaskFrontmatterSchema so all existing tasks continue to parse without changes.

**When to use:** Extending any existing schema with backward-compatible fields.

**Example:**

```typescript
// In schemas.ts -- extend existing TaskFrontmatterSchema

/** Pattern for workflow IDs: WF-001, WF-042, etc. */
export const WORKFLOW_ID_PATTERN = /^WF-\d+$/;

export const TaskFrontmatterSchema = z.object({
  // ... all existing fields unchanged ...
  id: z.string().regex(TASK_ID_PATTERN),
  title: z.string(),
  status: z.enum(["backlog", "in-progress", "review", "done", "blocked"]).default("backlog"),
  column: z.string().default("Backlog"),
  priority: z.enum(["low", "medium", "high", "critical"]).default("medium"),
  capabilities: z.array(z.string()).default([]),
  depends_on: z.array(z.string().regex(TASK_ID_PATTERN)).default([]),
  claimed_by: z.string().nullable().default(null),
  claimed_at: z.string().nullable().default(null),
  created: z.string().optional(),
  updated: z.string().optional(),
  parent: z.string().nullable().default(null),

  // New orchestration fields (all optional with defaults per D-10)
  workflow: z.string().regex(WORKFLOW_ID_PATTERN).nullable().default(null),
  verification_type: z.enum(["automatic", "human", "external", "mixed"]).default("automatic"),
  side_effect_class: z.enum(["none", "reversible", "irreversible"]).default("none"),
  approval_required: z.boolean().default(false),
  estimated_size: z.enum(["small", "medium", "large"]).default("medium"),
  execution_mode: z.enum(["auto", "manual", "interactive"]).default("auto"),
});
```

### Pattern 2: New Schema (WorkflowFrontmatterSchema)

**What:** Define workflow schema following ProjectFrontmatterSchema and TaskFrontmatterSchema patterns.

**Example:**

```typescript
// In schemas.ts

export const WorkflowFrontmatterSchema = z.object({
  id: z.string().regex(WORKFLOW_ID_PATTERN),
  title: z.string(),
  status: z.enum(["draft", "active", "paused", "completed", "failed"]).default("draft"),
  goal: z.string(),
  goal_check: z.string().nullable().default(null),
  tasks: z.array(z.string().regex(TASK_ID_PATTERN)).default([]),
  template: z.string().nullable().default(null),
  created: z.string().optional(),
  updated: z.string().optional(),
});
```

### Pattern 3: Parser Function (parseWorkflowFrontmatter)

**What:** Follow the exact pattern of parseProjectFrontmatter and parseTaskFrontmatter.

**Example:**

```typescript
// In frontmatter.ts
export function parseWorkflowFrontmatter(
  content: string,
  filePath: string,
): ParseResult<WorkflowFrontmatter> {
  return parseAndValidate(content, filePath, WorkflowFrontmatterSchema);
}
```

### Pattern 4: Template Generator (generateWorkflowMd)

**What:** Follow generateProjectMd / generateQueueMd pattern for workflow file generation.

**Example:**

```typescript
// In templates.ts
export function generateWorkflowMd(opts: {
  id: string;
  title: string;
  goal: string;
  tasks?: string[];
  template?: string;
  goalCheck?: string;
}): string {
  const today = new Date().toISOString().split("T")[0];
  const data = WorkflowFrontmatterSchema.parse({
    id: opts.id,
    title: opts.title,
    goal: opts.goal,
    tasks: opts.tasks ?? [],
    template: opts.template ?? null,
    goal_check: opts.goalCheck ?? null,
    created: today,
    updated: today,
  });

  const yaml = YAML.stringify(data, { schema: "core" });
  return `---\n${yaml}---\n\n## Goal\n\n${opts.goal}\n\n## Steps\n\n## Notes\n`;
}
```

### Pattern 5: Scaffold Extension (nextWorkflowId + workflows/ dir)

**What:** Clone nextTaskId() pattern for workflows; add workflows/ creation to create() and createSubProject().

**Example:**

```typescript
// In scaffold.ts -- add to ProjectManager

async nextWorkflowId(projectDir: string): Promise<string> {
  const workflowsDir = path.join(projectDir, "workflows");
  let entries: string[];
  try {
    entries = await fs.readdir(workflowsDir);
  } catch {
    return "WF-001";
  }

  const pattern = /^WF-(\d+)\.md$/;
  let maxId = 0;
  for (const entry of entries) {
    const match = pattern.exec(entry);
    if (match) {
      const num = parseInt(match[1], 10);
      if (num > maxId) {
        maxId = num;
      }
    }
  }

  const next = maxId + 1;
  return `WF-${String(next).padStart(3, "0")}`;
}
```

### Pattern 6: Capability Registry (project-level)

**What:** Add `allowed_capabilities` to ProjectFrontmatterSchema and a validation function.

**Example:**

```typescript
// In schemas.ts -- extend ProjectFrontmatterSchema
export const ProjectFrontmatterSchema = z.object({
  // ... existing fields ...
  allowed_capabilities: z.array(z.string()).default([]),
});

// In capability-registry.ts (NEW file)
/**
 * Validate that all capability tags on a task are registered in the project.
 * Empty allowed list = no restriction (backward compatible).
 * Empty task caps = always valid.
 */
export function validateCapabilities(
  taskCaps: string[],
  allowedCaps: string[],
): { valid: boolean; unregistered: string[] } {
  if (allowedCaps.length === 0 || taskCaps.length === 0) {
    return { valid: true, unregistered: [] };
  }
  const allowed = new Set(allowedCaps);
  const unregistered = taskCaps.filter((cap) => !allowed.has(cap));
  return { valid: unregistered.length === 0, unregistered };
}
```

### Anti-Patterns to Avoid

- **Breaking existing consumers:** Never make existing optional fields required or change defaults. All new task fields MUST be optional with defaults.
- **Separate schema file for workflows:** Keep all schemas in `schemas.ts` to match the existing single-file pattern. Don't split into `workflow-schemas.ts`.
- **Custom YAML parsing:** Always use the existing `parseAndValidate<T>()` generic. Don't write a new parser.
- **Non-atomic file writes:** Always use the tmp+rename pattern from `writeFileAtomic()`. Don't use direct `writeFile`.

## Don't Hand-Roll

| Problem                     | Don't Build                    | Use Instead                                         | Why                                                           |
| --------------------------- | ------------------------------ | --------------------------------------------------- | ------------------------------------------------------------- |
| YAML frontmatter extraction | Custom regex parser            | Existing `extractYamlBlock()` in frontmatter.ts     | Already handles edge cases (CRLF, empty blocks, nested `---`) |
| Schema validation           | Manual field checking          | Zod `safeParse()` with discriminated union result   | Consistent error shape, type inference, default filling       |
| Atomic writes               | `fs.writeFile` directly        | `writeFileAtomic()` from scaffold.ts                | Prevents partial reads from concurrent processes              |
| ID generation               | UUID or random-based IDs       | `nextWorkflowId()` following `nextTaskId()` pattern | Sequential, human-readable, consistent with TASK-NNN          |
| YAML serialization          | `JSON.stringify` + manual YAML | `YAML.stringify(data, { schema: "core" })`          | Handles special chars, avoids YAML 1.1 boolean quirks         |

## Common Pitfalls

### Pitfall 1: YAML 1.1 Boolean Coercion

**What goes wrong:** YAML 1.1 treats bare `no`, `yes`, `on`, `off` as booleans. A status value or tag name could be misinterpreted.
**Why it happens:** Default YAML parser uses 1.1 spec.
**How to avoid:** Always use `schema: "core"` option in both `YAML.parse()` and `YAML.stringify()`. The existing code already does this.
**Warning signs:** A `status: "no"` or tag named `on` parsing as boolean `true`/`false`.

### Pitfall 2: Breaking Existing Task Consumers

**What goes wrong:** Adding a required field to TaskFrontmatterSchema causes every existing task file to fail validation.
**Why it happens:** Existing task files don't have the new fields in their frontmatter.
**How to avoid:** Every new field MUST use `.default()` or `.optional()`. Test by parsing an existing minimal task (just `id` + `title`) and confirming it still succeeds with all defaults applied.
**Warning signs:** `parseTaskFrontmatter` returning `success: false` on files that previously worked.

### Pitfall 3: Capability Registry Backward Compatibility

**What goes wrong:** Adding strict capability validation breaks projects that don't define `allowed_capabilities`.
**Why it happens:** Existing projects have no `allowed_capabilities` field in PROJECT.md.
**How to avoid:** When `allowed_capabilities` is empty (default `[]`), skip validation entirely. Only enforce when the project explicitly defines a capabilities list.
**Warning signs:** Tasks with `capabilities: ["code"]` failing validation in projects that never set up a registry.

### Pitfall 4: Workflow ID Pattern Mismatch with Regex

**What goes wrong:** The `WORKFLOW_ID_PATTERN` regex doesn't match the actual file naming convention.
**Why it happens:** Pattern and file scanner use different conventions (e.g., `WF-001` vs `WF-1`).
**How to avoid:** Use `/^WF-\d+$/` for the schema regex (accepts any digit count) and `padStart(3, "0")` only in `nextWorkflowId()` generation. This mirrors how `TASK_ID_PATTERN` and `nextTaskId()` work.
**Warning signs:** Schema rejecting `WF-1000` because regex requires exactly 3 digits.

### Pitfall 5: Circular Dependency in Barrel Exports

**What goes wrong:** Adding workflow exports to `index.ts` causes circular imports if capability-registry imports from schemas which imports from types.
**Why it happens:** New file depends on schemas, schemas re-exported through index.
**How to avoid:** Import directly from `./schemas.js` and `./types.js` within the module. The barrel `index.ts` is for external consumers only. Never import from `./index.js` within `src/projects/`.
**Warning signs:** Runtime "Cannot access before initialization" errors.

## Code Examples

### Workflow Body Sections (Discretion Area)

The CONTEXT.md marks body sections as Claude's discretion. Based on what downstream consumers will need:

```markdown
## Goal

{goal text -- same as frontmatter goal, expanded with context}

## Steps

- [ ] Step 1: {description}
- [ ] Step 2: {description}

## Notes

{free-form notes, context, constraints}
```

These three sections are minimal and sufficient. `## Goal` gives the orchestrator readable context. `## Steps` is the human-readable plan (task list in frontmatter is the machine-readable version). `## Notes` captures anything else. This matches the directional guidance from D-02.

### Complete Workflow File Example

```markdown
---
id: WF-001
title: Implement user authentication
status: draft
goal: Users can log in via OAuth2 and maintain sessions
goal_check: null
tasks:
  - TASK-001
  - TASK-002
  - TASK-003
template: code-feature
created: "2026-03-29"
updated: "2026-03-29"
---

## Goal

Users can log in via OAuth2 and maintain sessions across page refreshes.

## Steps

- [ ] Set up OAuth2 provider configuration (TASK-001)
- [ ] Implement session persistence (TASK-002)
- [ ] Add login/logout UI flow (TASK-003)

## Notes

Using existing auth library. Session storage via cookies with httpOnly flag.
```

### Extended Task File Example

```markdown
---
id: TASK-001
title: Set up OAuth2 provider configuration
status: backlog
column: Backlog
priority: high
capabilities:
  - code
depends_on: []
claimed_by: null
claimed_at: null
created: "2026-03-29"
updated: "2026-03-29"
parent: null
workflow: WF-001
verification_type: automatic
side_effect_class: none
approval_required: false
estimated_size: small
execution_mode: auto
---

# Set up OAuth2 provider configuration

Configure the OAuth2 provider with client ID, secret, and callback URL.
```

## State of the Art

| Old Approach      | Current Approach                                | When Changed   | Impact                                          |
| ----------------- | ----------------------------------------------- | -------------- | ----------------------------------------------- |
| Zod v3 `.parse()` | Zod v4 `.safeParse()` with discriminated unions | Zod 4.x (2025) | Use `safeParse` consistently; `.parse()` throws |

**Deprecated/outdated:**

- Zod v3 `z.nativeEnum()` has been replaced by `z.enum()` for string unions in v4. The existing code already uses `z.enum()`.

## Validation Architecture

### Test Framework

| Property           | Value                                         |
| ------------------ | --------------------------------------------- |
| Framework          | Vitest 4.1.0                                  |
| Config file        | `vitest.config.ts`                            |
| Quick run command  | `pnpm test -- src/projects/<file>.test.ts -x` |
| Full suite command | `pnpm test`                                   |

### Phase Requirements to Test Map

| Req ID | Behavior                                                                 | Test Type | Automated Command                                                                | File Exists?                          |
| ------ | ------------------------------------------------------------------------ | --------- | -------------------------------------------------------------------------------- | ------------------------------------- |
| WF-01  | WorkflowFrontmatterSchema parses valid WF frontmatter, rejects invalid   | unit      | `pnpm test -- src/projects/schemas.test.ts -t "WorkflowFrontmatterSchema" -x`    | Partially (file exists, tests to add) |
| WF-01  | parseWorkflowFrontmatter extracts YAML and validates                     | unit      | `pnpm test -- src/projects/frontmatter.test.ts -t "parseWorkflowFrontmatter" -x` | Partially (file exists, tests to add) |
| WF-01  | generateWorkflowMd produces valid frontmatter + body                     | unit      | `pnpm test -- src/projects/templates.test.ts -x`                                 | No (file does not exist)              |
| WF-02  | Workflow status enum accepts all lifecycle states                        | unit      | `pnpm test -- src/projects/schemas.test.ts -t "status" -x`                       | Partially                             |
| WF-03  | All required/optional frontmatter fields validate correctly              | unit      | `pnpm test -- src/projects/schemas.test.ts -t "WorkflowFrontmatterSchema" -x`    | Partially                             |
| WF-04  | ProjectManager.create() produces workflows/.gitkeep                      | unit      | `pnpm test -- src/projects/scaffold.test.ts -t "workflows" -x`                   | Partially (file exists, tests to add) |
| WF-04  | nextWorkflowId() returns sequential WF-NNN IDs                           | unit      | `pnpm test -- src/projects/scaffold.test.ts -t "nextWorkflowId" -x`              | Partially                             |
| DEC-04 | Extended TaskFrontmatterSchema accepts new optional fields with defaults | unit      | `pnpm test -- src/projects/schemas.test.ts -t "TaskFrontmatterSchema" -x`        | Partially                             |
| DEC-04 | Existing minimal tasks still parse successfully                          | unit      | `pnpm test -- src/projects/schemas.test.ts -t "applies defaults" -x`             | Yes (extend existing test)            |
| CAP-01 | validateCapabilities enforces project registry                           | unit      | `pnpm test -- src/projects/capability-registry.test.ts -x`                       | No (new file)                         |
| CAP-01 | Empty allowed_capabilities = no restriction                              | unit      | `pnpm test -- src/projects/capability-registry.test.ts -t "empty" -x`            | No (new file)                         |

### Sampling Rate

- **Per task commit:** `pnpm test -- src/projects/ -x`
- **Per wave merge:** `pnpm test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `src/projects/templates.test.ts` -- covers WF-01 (generateWorkflowMd)
- [ ] `src/projects/capability-registry.test.ts` -- covers CAP-01

## Open Questions

1. **ProjectFrontmatterSchema extension for allowed_capabilities**
   - What we know: D-14 says capability tags use a project-level registry in PROJECT.md frontmatter. D-15 says validation is strict.
   - What's unclear: Should `allowed_capabilities` be at the top level of ProjectFrontmatterSchema, or nested under a new `orchestration` object? Top-level is simpler and matches the flat pattern of existing fields.
   - Recommendation: Add `allowed_capabilities: z.array(z.string()).default([])` at top level. Simpler, consistent with existing schema flatness.

2. **Workflow body section refinement**
   - What we know: D-02 says ## Goal, ## Steps, ## Notes are directional. Discretion area says Claude can refine.
   - What's unclear: Whether downstream consumers (Phase 2 orchestrator) need more structured sections.
   - Recommendation: Ship with `## Goal`, `## Steps`, `## Notes`. These are sufficient for Phase 1 (schema + parsing). Phase 2 can add sections if the orchestrator needs them.

3. **Should workflows/ be added to existing projects retroactively?**
   - What we know: WF-04 requires workflows/ to exist in project directories.
   - What's unclear: Whether `create()` alone is sufficient (new projects only) or if a migration/ensure function is needed for existing projects.
   - Recommendation: Add `ensureWorkflowsDir(projectDir)` helper that creates workflows/ if missing. The orchestrator (Phase 2) calls this before writing workflows. Don't retroactively modify existing projects during Phase 1.

## Sources

### Primary (HIGH confidence)

- `src/projects/schemas.ts` -- Existing Zod schema patterns (TaskFrontmatterSchema, ProjectFrontmatterSchema)
- `src/projects/frontmatter.ts` -- parseAndValidate generic, YAML core schema usage
- `src/projects/templates.ts` -- generateProjectMd / generateQueueMd patterns
- `src/projects/scaffold.ts` -- ProjectManager, nextTaskId(), writeFileAtomic()
- `src/projects/types.ts` -- z.infer type derivation pattern
- `src/projects/capability-matcher.ts` -- ANY-match capability pattern
- `src/projects/index.ts` -- Barrel export structure
- `src/projects/checkpoint.ts` -- Atomic write and sidecar file patterns
- `src/projects/schemas.test.ts` -- Schema test patterns (safeParse, defaults, enum validation)
- `src/projects/scaffold.test.ts` -- Scaffold test patterns (createTempHomeEnv, file assertions)
- `package.json` -- Zod 4.3.6, vitest ^4.1.0

### Secondary (MEDIUM confidence)

- `.planning/phases/01-schema-workflow-foundation/01-CONTEXT.md` -- All 16 locked decisions (D-01 through D-16)
- `.planning/REQUIREMENTS.md` -- WF-01 through WF-04, DEC-04, CAP-01

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH - All libraries already in use; no new dependencies
- Architecture: HIGH - Exact patterns exist in codebase to follow
- Pitfalls: HIGH - Backward compatibility concerns are well-understood from existing schema structure

**Research date:** 2026-03-29
**Valid until:** 2026-04-28 (stable -- patterns are established, no external dependency changes expected)
