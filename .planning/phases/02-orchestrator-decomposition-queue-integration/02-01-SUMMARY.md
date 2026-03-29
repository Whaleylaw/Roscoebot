---
phase: 02-orchestrator-decomposition-queue-integration
plan: 01
subsystem: orchestration
tags: [zod, yaml, agent-config, task-templates, workspace-templates]

requires:
  - phase: 01-schema-workflow-foundation
    provides: TaskFrontmatterSchema, WorkflowFrontmatterSchema, project scaffold

provides:
  - AgentEntrySchema extended with project and capabilities fields
  - generateTaskMd template helper for DEC-02 task markdown
  - TaskMdBody type for task body sections
  - Orchestrator workspace template constants (IDENTITY.md, SOUL.md, AGENTS.md)
  - getOrchestratorWorkspaceFiles helper function

affects: [02-02, 02-03, 02-04, orchestrator-bootstrap, heartbeat-dispatch]

tech-stack:
  added: []
  patterns: [orchestrator-workspace-templates, task-markdown-generation]

key-files:
  created:
    - src/agents/orchestrator-templates.ts
    - src/agents/orchestrator-templates.test.ts
  modified:
    - src/config/zod-schema.agent-runtime.ts
    - src/projects/templates.ts
    - src/projects/templates.test.ts
    - src/projects/types.ts
    - src/projects/index.ts

key-decisions:
  - "generateTaskMd validates through TaskFrontmatterSchema.parse for guaranteed schema compliance"
  - "Orchestrator templates are static string constants, not runtime-generated (D-13: project context injected separately)"

patterns-established:
  - "Task markdown generation: frontmatter via schema parse + YAML stringify, body via section headings"
  - "Workspace templates: exported constants + helper function returning filename/content pairs"

requirements-completed: [ORC-01, ORC-04, ORC-05, DEC-02]

duration: 3min
completed: 2026-03-29
---

# Phase 02 Plan 01: Schema Extension and Templates Summary

**AgentEntrySchema extended with orchestrator config fields, generateTaskMd producing 5-section DEC-02 task markdown, and orchestrator workspace templates with Decomposition Standards and Dispatch Policy**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-29T17:54:23Z
- **Completed:** 2026-03-29T17:57:42Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments
- Extended AgentEntrySchema with optional `project` and `capabilities` fields for orchestrator agent config
- Created generateTaskMd function that produces valid task markdown with all 5 DEC-02 body sections (Objective, Context, Action Guidance, Success Criteria, Verification)
- Created orchestrator workspace template constants (IDENTITY.md, SOUL.md, AGENTS.md) with Decomposition Standards and Dispatch Policy sections
- Added TaskMdBody type and updated barrel exports

## Task Commits

Each task was committed atomically:

1. **Task 1: Extend AgentEntrySchema and add generateTaskMd** - `2af8f9cd9` (test: RED), `1c592f107` (feat: GREEN)
2. **Task 2: Create orchestrator workspace template files** - `ed297eca6` (feat)

## Files Created/Modified
- `src/config/zod-schema.agent-runtime.ts` - Added project and capabilities optional fields to AgentEntrySchema
- `src/projects/templates.ts` - Added generateTaskMd function with TaskFrontmatterSchema validation
- `src/projects/templates.test.ts` - Added 7 test cases for generateTaskMd
- `src/projects/types.ts` - Added TaskMdBody type
- `src/projects/index.ts` - Updated barrel exports with generateTaskMd and TaskMdBody
- `src/agents/orchestrator-templates.ts` - Orchestrator workspace template constants and helper
- `src/agents/orchestrator-templates.test.ts` - 5 test cases for template content and structure

## Decisions Made
- generateTaskMd validates through TaskFrontmatterSchema.parse to guarantee schema compliance rather than manual YAML construction
- Orchestrator templates are static string constants shipped with the package (D-08), with project context injected separately at runtime (D-13)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- AgentEntrySchema ready for orchestrator agent config in 02-02 (orchestrator bootstrap)
- generateTaskMd ready for decomposition engine in 02-03
- Workspace templates ready for orchestrator agent workspace provisioning in 02-02

## Self-Check: PASSED

All 7 files verified present. All 3 commit hashes verified in git log.

---
*Phase: 02-orchestrator-decomposition-queue-integration*
*Completed: 2026-03-29*
