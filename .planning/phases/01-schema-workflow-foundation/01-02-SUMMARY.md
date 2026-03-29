---
phase: 01-schema-workflow-foundation
plan: 02
subsystem: projects
tags: [workflow, markdown, templates, scaffold, zod]

# Dependency graph
requires:
  - phase: 01-schema-workflow-foundation (plan 01)
    provides: WorkflowFrontmatterSchema, parseWorkflowFrontmatter, WORKFLOW_ID_PATTERN
provides:
  - generateWorkflowMd function for creating WF-NNN.md files
  - nextWorkflowId method for sequential workflow ID generation
  - ensureWorkflowsDir helper for retrofitting existing projects
  - workflows/ directory in project scaffold (create + createSubProject)
  - barrel exports for all workflow symbols through index.ts
affects: [01-schema-workflow-foundation plan 03, phase-02-orchestration]

# Tech tracking
tech-stack:
  added: []
  patterns:
    [
      TDD red-green for template and scaffold functions,
      YAML frontmatter generation via Zod schema validation,
    ]

key-files:
  created: [src/projects/templates.test.ts]
  modified:
    [
      src/projects/templates.ts,
      src/projects/scaffold.ts,
      src/projects/scaffold.test.ts,
      src/projects/index.ts,
    ]

key-decisions:
  - "ensureWorkflowsDir exported as standalone helper for Phase 2 orchestrator to retrofit existing projects"
  - "nextWorkflowId uses max-based gap handling (same pattern as nextTaskId)"

patterns-established:
  - "Workflow file generation: generateWorkflowMd with Zod validation + YAML stringify + body sections"
  - "Project scaffold includes workflows/.gitkeep alongside tasks/.gitkeep"

requirements-completed: [WF-01, WF-04]

# Metrics
duration: 4min
completed: 2026-03-29
---

# Phase 01 Plan 02: Workflow Templates and Scaffold Summary

**generateWorkflowMd template function, workflows/ directory in project scaffold, nextWorkflowId sequential ID generation, and barrel exports**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-29T13:37:19Z
- **Completed:** 2026-03-29T13:41:15Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments

- generateWorkflowMd produces valid WF-NNN.md with YAML frontmatter and ## Goal / ## Steps / ## Notes body sections
- ProjectManager.create() and createSubProject() now create workflows/.gitkeep alongside tasks/.gitkeep
- nextWorkflowId returns sequential WF-NNN IDs with 3-digit zero-padding and gap handling
- ensureWorkflowsDir helper for retrofitting existing projects without workflows/
- All new symbols exported through src/projects/index.ts barrel

## Task Commits

Each task was committed atomically (TDD: test then feat):

1. **Task 1: Add generateWorkflowMd template and tests**
   - `3ca4b4c05` (test: failing tests for generateWorkflowMd)
   - `445c5981f` (feat: add generateWorkflowMd template function)
2. **Task 2: Extend ProjectManager with workflows/ dir and nextWorkflowId, update barrel exports**
   - `5ceda465b` (test: failing tests for workflows/ dir, nextWorkflowId, ensureWorkflowsDir)
   - `a227933c9` (feat: extend ProjectManager with workflows/ dir, nextWorkflowId, barrel exports)

## Files Created/Modified

- `src/projects/templates.ts` - Added generateWorkflowMd function with Zod-validated YAML frontmatter
- `src/projects/templates.test.ts` - 11 tests: 8 for generateWorkflowMd, round-trip tests for all template functions
- `src/projects/scaffold.ts` - Added ensureWorkflowsDir, nextWorkflowId, workflows/ in create/createSubProject
- `src/projects/scaffold.test.ts` - Added 9 tests: workflows/ dir creation, nextWorkflowId, ensureWorkflowsDir
- `src/projects/index.ts` - Added barrel exports for WorkflowFrontmatterSchema, WORKFLOW_ID_PATTERN, WorkflowFrontmatter, parseWorkflowFrontmatter, generateWorkflowMd, ensureWorkflowsDir

## Decisions Made

- ensureWorkflowsDir exported as a standalone function (not a class method) for flexible Phase 2 orchestrator use on existing projects
- nextWorkflowId follows exact same max-based gap-handling pattern as nextTaskId for consistency

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- Worktree was behind main repo (missing Plan 01-01 output) -- fast-forward merged to get WorkflowFrontmatterSchema
- Vitest v4 does not support `-x` flag (plan used it) -- used `--bail 1` instead
- Pre-existing type errors in gateway/UI files unrelated to plan changes

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- All workflow file generation and project scaffolding complete
- Plan 03 (frontmatter parsing extensions) can proceed -- all barrel exports wired
- Phase 2 orchestration can use generateWorkflowMd + ensureWorkflowsDir to create workflows in existing projects

---

_Phase: 01-schema-workflow-foundation_
_Completed: 2026-03-29_
