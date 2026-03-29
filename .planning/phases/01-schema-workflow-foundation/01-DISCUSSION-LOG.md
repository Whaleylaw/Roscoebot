# Phase 1: Schema & Workflow Foundation - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md -- this log preserves the alternatives considered.

**Date:** 2026-03-29
**Phase:** 01-schema-workflow-foundation
**Areas discussed:** Workflow file structure, Lifecycle transitions, Task schema extension, Capability tag design

---

## Workflow File Structure

### Task references in workflow frontmatter

| Option                              | Description                                                                               | Selected |
| ----------------------------------- | ----------------------------------------------------------------------------------------- | -------- |
| Explicit task list in frontmatter   | tasks: [TASK-001, TASK-002] in YAML frontmatter. Validates against TASK_ID_PATTERN.       | ✓        |
| Convention-based (no explicit list) | Tasks reference workflow via their own frontmatter. Workflow discovers tasks by scanning. |          |
| Both directions                     | Workflow lists tasks AND tasks reference workflow. Redundant but enables fast lookup.     |          |

**User's choice:** Explicit task list in frontmatter
**Notes:** Matches WF-03 requirement directly.

### Body format

| Option              | Description                                                                           | Selected |
| ------------------- | ------------------------------------------------------------------------------------- | -------- |
| Structured sections | ## Goal, ## Steps, ## Notes -- consistent, parseable, aligns with PROJECT.md pattern. | ✓        |
| Freeform markdown   | Any markdown below frontmatter. Maximum flexibility.                                  |          |
| You decide          | Claude picks.                                                                         |          |

**User's choice:** Structured sections

### ID format

| Option            | Description                                                       | Selected |
| ----------------- | ----------------------------------------------------------------- | -------- |
| WF-NNN (3-digit)  | Consistent with TASK_ID_PATTERN. Same nextId() logic reusable.    | ✓        |
| WF-NNNN (4-digit) | More room for large projects. Slight deviation from task pattern. |          |
| You decide        | Claude picks.                                                     |          |

**User's choice:** WF-NNN (3-digit, like tasks)

### Template reference field

| Option             | Description                                                                         | Selected |
| ------------------ | ----------------------------------------------------------------------------------- | -------- |
| Template name only | template: 'code-feature'. Resolved at runtime. Clean, portable.                     | ✓        |
| Relative path      | template: 'templates/code-feature.md'. Explicit but couples to directory structure. |          |
| You decide         | Claude picks.                                                                       |          |

**User's choice:** Template name only

---

## Lifecycle Transitions

### Backward transitions

| Option                    | Description                                               | Selected |
| ------------------------- | --------------------------------------------------------- | -------- |
| Forward-only with restart | No backward transitions. Clone as new workflow for retry. |          |
| Allow reopen              | completed/failed can go back to active.                   |          |
| Fully flexible            | Any state to any state.                                   |          |

**User's choice:** Other (extended discussion)
**Notes:** User described the orchestrator heartbeat model in detail:

- Orchestrator heartbeats every 30 minutes, checks tasks AND workflows
- Stuck/dead tasks go back in the queue; completed tasks are never redone
- Workflows checkpoint at each task boundary
- Recovery is always at individual task level, never restart whole workflow
- Workflows should work the same way tasks work

### Status derivation

| Option                         | Description                                                                            | Selected |
| ------------------------------ | -------------------------------------------------------------------------------------- | -------- |
| Orchestrator sets explicitly   | Single writer, clear ownership.                                                        |          |
| Auto-derived (computed)        | Status computed from task states on read.                                              |          |
| Store + recompute on heartbeat | Status in frontmatter, updated by orchestrator. Fast reads, tasks are source of truth. | ✓        |

**User's choice:** Store + recompute on heartbeat
**Notes:** User questioned why auto-derive would ever conflict. After discussion, agreed that auto-derive is correct (tasks are truth) but storing the computed value in frontmatter enables fast reads. Orchestrator recomputes on heartbeat.

### Goal completion model

**User's choice:** Two completion paths -- run-through (all tasks done) OR goal-achieved (external condition met)
**Notes:** User described the law firm landmark system extensively:

- Landmarks are the single source of truth for whether something is achieved
- Workflows work toward landmarks, but landmarks can be satisfied by anything
- User referenced existing workflow files at `~/.openclaw/workspace-paralegal/FirmVault/skills.tools.workflows/workflows/`
- The `goal_check` field must be OPTIONAL -- pre-defined workflows use external landmark checks, but ad-hoc workflows just run through tasks
- "There shouldn't be two boxes to check" -- one source of truth

---

## Task Schema Extension

### Field requirements

| Option                        | Description                                                   | Selected |
| ----------------------------- | ------------------------------------------------------------- | -------- |
| All optional with defaults    | Existing tasks unchanged. Orchestrated tasks populate fields. | ✓        |
| Required when workflow is set | Conditional requirements.                                     |          |
| You decide                    | Claude picks.                                                 |          |

**User's choice:** All optional with defaults

### Workflow reference field

| Option           | Description                                                           | Selected |
| ---------------- | --------------------------------------------------------------------- | -------- |
| Workflow ID only | workflow: 'WF-001'. Resolved by scanning. Consistent with depends_on. | ✓        |
| Relative path    | workflow: 'workflows/WF-001.md'. Explicit.                            |          |
| You decide       | Claude picks.                                                         |          |

**User's choice:** Workflow ID only

### Estimated size granularity

| Option               | Description                             | Selected |
| -------------------- | --------------------------------------- | -------- |
| T-shirt sizes        | small, medium, large. Simple, familiar. | ✓        |
| Numeric scale (1-5)  | Finer grain.                            |          |
| Time-based estimates | quick, short, medium, long.             |          |

**User's choice:** T-shirt sizes

### Execution mode

| Option                                 | Description                                                                        | Selected |
| -------------------------------------- | ---------------------------------------------------------------------------------- | -------- |
| Three modes: auto, manual, interactive | auto=agent, manual=human, interactive=both. Matches existing workflow step owners. | ✓        |
| Two modes: auto, manual                | Simpler. Interactive is v2.                                                        |          |
| You decide                             | Claude picks.                                                                      |          |

**User's choice:** Three modes

---

## Capability Tag Design

### Tag freedom

| Option                       | Description                                                | Selected |
| ---------------------------- | ---------------------------------------------------------- | -------- |
| Free-form strings            | Any string valid. Convention-based.                        |          |
| Registry with known + custom | Known tags plus custom ones. Autocomplete and validation.  | ✓        |
| Strict enum only             | Only predefined tags. Requires code changes for new types. |          |

**User's choice:** Registry with known + custom

### Registry location

| Option                            | Description                          | Selected |
| --------------------------------- | ------------------------------------ | -------- |
| Project-level config              | Each project defines its valid tags. | ✓        |
| Global config                     | Shared across all projects.          |          |
| Both (global + project overrides) | Global defaults, project additions.  |          |

**User's choice:** Project-level config

### Enforcement level

| Option                        | Description                                                  | Selected |
| ----------------------------- | ------------------------------------------------------------ | -------- |
| Warn on unknown, don't reject | Warning but accepted. Flexible.                              |          |
| Strict rejection              | Unregistered tags fail validation. Prevents typos and drift. | ✓        |
| You decide                    | Claude picks.                                                |          |

**User's choice:** Strict rejection

---

## Claude's Discretion

- Exact structured body sections for workflow files
- Internal implementation details: schema organization, parser structure, test approach

## Deferred Ideas

None -- discussion stayed within phase scope
