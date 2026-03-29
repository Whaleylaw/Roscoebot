# Phase 1: Schema & Workflow Foundation - Context

**Gathered:** 2026-03-29
**Status:** Ready for planning

<domain>
## Phase Boundary

Workflow files (WF-NNN.md) and extended task frontmatter exist as validated, first-class entities in the project directory structure. This phase delivers schemas, parsers, validators, scaffold logic, and directory structure. It does NOT deliver orchestration, decomposition, or execution -- those are Phase 2+.

</domain>

<decisions>
## Implementation Decisions

### Workflow File Structure

- **D-01:** Workflow files use WF-NNN format with 3-digit zero-padding (WF-001, WF-042), mirroring TASK-NNN pattern. Same `nextId()` logic from `scaffold.ts` can be reused.
- **D-02:** Workflow files have YAML frontmatter + structured markdown body with defined sections (## Goal, ## Steps, ## Notes). Consistent with PROJECT.md and task file patterns.
- **D-03:** Workflows reference their tasks via an explicit task list in frontmatter: `tasks: [TASK-001, TASK-002]`. Easy to parse, validates against existing TASK_ID_PATTERN.
- **D-04:** The optional `template` field stores a template name only (e.g., `template: 'code-feature'`), resolved at runtime against a known templates directory.

### Lifecycle & Goal Completion

- **D-05:** Workflow status is auto-derived from task states but stored in frontmatter for fast reads. The orchestrator recomputes and writes it on each heartbeat. Tasks are the source of truth; the stored status is a cache.
- **D-06:** Workflows use the same lifecycle states as tasks: draft, active, paused, completed, failed.
- **D-07:** Two completion paths exist: (1) run-through -- all tasks execute to completion; (2) goal-achieved -- an external condition is met mid-workflow and remaining tasks are cancelled/skipped.
- **D-08:** `goal` field (string, required) describes what the workflow aims to achieve. `goal_check` field (string, optional) references an external condition (landmark ID, query, file check). When `goal_check` is present, the system checks it on heartbeat and can short-circuit the workflow. When absent, completion means all tasks done.
- **D-09:** Recovery is always at the individual task level. A stuck/failed task goes back in the queue; completed tasks in the same workflow are never redone. The orchestrator heartbeats workflows the same way it heartbeats tasks.

### Task Schema Extension

- **D-10:** All new task fields are optional with sensible defaults so existing tasks pass validation unchanged. Defaults: `verification_type: 'automatic'`, `side_effect_class: 'none'`, `approval_required: false`, `estimated_size: 'medium'`, `execution_mode: 'auto'`.
- **D-11:** The `workflow` field on a task stores a workflow ID only (e.g., `workflow: 'WF-001'`), resolved by scanning the workflows/ directory.
- **D-12:** `estimated_size` uses t-shirt sizes: `small`, `medium`, `large`.
- **D-13:** `execution_mode` has three values: `auto` (agent handles it), `manual` (human must do it), `interactive` (agent + human collaborate). Maps directly to existing workflow step patterns where steps have "Owner: Agent" vs "Owner: User".

### Capability Tag Design

- **D-14:** Capability tags use a project-level registry. Each project defines its valid capability tags (e.g., in PROJECT.md frontmatter or a capabilities section).
- **D-15:** Validation is strict: tasks with unregistered capability tags fail validation. This prevents typos and drift. New tags must be explicitly added to the project registry first.
- **D-16:** Standard starter tags are documented (code, research, ops, review, deploy) but each project defines its own set. No global registry.

### Claude's Discretion

- Exact structured body sections for workflow files (## Goal, ## Steps, ## Notes are directional -- Claude can refine the section list based on what downstream consumers need)
- Internal implementation details: schema organization, parser structure, test approach

</decisions>

<canonical_refs>

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Existing Project System (patterns to follow)

- `src/projects/schemas.ts` -- Zod schemas for Project, Task, Queue frontmatter (the pattern for WorkflowFrontmatterSchema)
- `src/projects/frontmatter.ts` -- YAML extraction + Zod validation pipeline (reuse parseAndValidate for workflows)
- `src/projects/types.ts` -- Inferred types from schemas (pattern for WorkflowFrontmatter type)
- `src/projects/templates.ts` -- Markdown generation with frontmatter (pattern for generateWorkflowMd)
- `src/projects/scaffold.ts` -- ProjectManager with directory creation, atomic writes, nextTaskId() (extend for workflows)
- `src/projects/capability-matcher.ts` -- ANY-match on string arrays (existing matcher, may need registry-aware wrapper)

### Existing Landmark/Workflow System (design reference)

- `~/.openclaw/workspace-paralegal/FirmVault/skills.tools.workflows/workflows/README.md` -- Architecture overview of existing passive workflow system
- `~/.openclaw/workspace-paralegal/FirmVault/skills.tools.workflows/workflows/phase_0_onboarding/landmarks.md` -- Landmark pattern: boolean/progressive checkpoints that workflows work toward
- `~/.openclaw/workspace-paralegal/FirmVault/skills.tools.workflows/workflows/phase_2_treatment/landmarks.md` -- Advanced landmarks: recurring, progressive, early-exit, safety-critical patterns
- `~/.openclaw/workspace-paralegal/FirmVault/skills.tools.workflows/workflows/phase_2_treatment/workflows/request_records_bills/workflow.md` -- Real workflow example: steps with owners (Agent/User), triggers, wait periods, per-item execution
- `~/.openclaw/workspace-paralegal/FirmVault/skills.tools.workflows/workflows/sample_workflow_state.json` -- Existing workflow state shape showing phase tracking, landmark booleans, exit criteria

### Requirements

- `.planning/REQUIREMENTS.md` -- WF-01 through WF-04, DEC-04, CAP-01 are this phase's requirements

</canonical_refs>

<code_context>

## Existing Code Insights

### Reusable Assets

- `parseAndValidate<T>()` in `frontmatter.ts` -- Generic YAML frontmatter parser with Zod validation. Reuse directly for workflow files.
- `ProjectManager.nextTaskId()` in `scaffold.ts` -- Sequential ID generation with zero-padding. Clone pattern for `nextWorkflowId()`.
- `writeFileAtomic()` in `scaffold.ts` -- Atomic file writes via tmp+rename. Reuse for workflow file creation.
- `generateProjectMd()` / `generateQueueMd()` in `templates.ts` -- Template generation pattern. Follow for `generateWorkflowMd()`.
- `matchCapabilities()` in `capability-matcher.ts` -- ANY-match on string arrays. Wrap with registry validation.

### Established Patterns

- Zod schemas define the shape, types are inferred via `z.infer<typeof Schema>`, parsers use `schema.safeParse()` with discriminated union results
- YAML frontmatter uses "core" schema to avoid YAML 1.1 quirks
- All file writes use atomic tmp+rename pattern
- Test files are colocated: `schemas.test.ts`, `frontmatter.test.ts`, `scaffold.test.ts`

### Integration Points

- `src/projects/index.ts` -- Barrel export for the projects module (add workflow exports here)
- `ProjectManager` in `scaffold.ts` -- Extend with workflow directory creation and nextWorkflowId()
- Task consumers throughout the codebase must not break when new optional fields appear in frontmatter

</code_context>

<specifics>
## Specific Ideas

- The existing law firm workflow system has landmarks as the single source of truth for goal completion. Workflows check landmarks, not the other way around. The `goal_check` field on workflow frontmatter is how this pattern is expressed generically: it points to an external condition that can short-circuit the workflow.
- Workflows can be pre-defined (law firm templates with landmark integration) OR created ad-hoc on the fly for any domain. The schema must support both without requiring external goal checks for simple workflows.
- The orchestrator heartbeats every 30 minutes. It checks workflows the same way it checks tasks. If a task has been alive 30+ minutes with no progress, the orchestrator messages the agent. If the agent is dead, the task goes back in the queue. This heartbeat model means workflow status must be efficiently checkable.

</specifics>

<deferred>
## Deferred Ideas

None -- discussion stayed within phase scope

</deferred>

---

_Phase: 01-schema-workflow-foundation_
_Context gathered: 2026-03-29_
