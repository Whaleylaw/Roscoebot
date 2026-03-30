---
phase: 05-intake-pipeline-templates
plan: 03
subsystem: orchestration
tags: [placement, intake-payload, project-routing, llm-reasoning]

requires:
  - phase: 01-schema-workflow-foundation
    provides: ProjectFrontmatterSchema, parseProjectFrontmatter
  - phase: 02-orchestrator-decomposition-queue-integration
    provides: OrchestratorPayload type and parseOrchestratorPayload pattern
provides:
  - ProjectSummary and PlacementSuggestion types for LLM-based project placement
  - readProjectSummaries for reading and filtering active projects
  - formatProjectsForPlacement for LLM prompt formatting (no keyword heuristics)
  - IntakePayload type extending OrchestratorPayload with template/placement/synthesis fields
  - parseIntakePayload and buildIntakePayload for pipeline use
affects: [05-intake-pipeline-templates, 06-progress-visibility]

tech-stack:
  added: []
  patterns: [LLM-data-formatting-only (D-04), backward-compatible-payload-extension]

key-files:
  created:
    - src/projects/placement.ts
    - src/projects/placement.test.ts
    - src/projects/intake-payload.ts
    - src/projects/intake-payload.test.ts
  modified: []

key-decisions:
  - "formatProjectsForPlacement is pure text formatting for LLM consumption -- no scoring, no keyword matching per D-04"
  - "IntakePayload extends OrchestratorPayload via intersection type for full backward compatibility"
  - "placementOverride uses optional projectName/projectDir to support both existing and new project overrides (PPL-03)"

patterns-established:
  - "LLM data formatting: format structured data for prompt inclusion without algorithmic reasoning"
  - "Payload extension: extend existing payload types via TypeScript intersection (&) for backward compatibility"

requirements-completed: [PPL-01, PPL-02, PPL-03]

duration: 3min
completed: 2026-03-29
---

# Phase 05 Plan 03: Placement & Intake Payload Summary

**Project placement helpers format active project data for LLM reasoning and IntakePayload extends OrchestratorPayload with template, placement, synthesis, and artifact type fields**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-29T22:57:11Z
- **Completed:** 2026-03-29T23:00:10Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Project placement helpers (readProjectSummaries, formatProjectsForPlacement) that format active project data for LLM prompt inclusion without keyword heuristics (D-04)
- IntakePayload type that extends OrchestratorPayload with templateName, templateParams, synthesize, placementOverride, and artifactType fields
- parseIntakePayload is fully backward-compatible with existing OrchestratorPayload messages
- 15 tests covering placement formatting, project filtering, payload parsing, override, and backward compat

## Task Commits

Each task was committed atomically:

1. **Task 1: Create project placement helpers** - `e25ba379b` (feat, TDD)
2. **Task 2: Create extended IntakePayload type and parser** - `b201910db` (feat, TDD)

## Files Created/Modified
- `src/projects/placement.ts` - ProjectSummary, PlacementSuggestion types; readProjectSummaries, formatProjectsForPlacement functions
- `src/projects/placement.test.ts` - 7 tests for placement formatting, filtering, missing fields, type shape
- `src/projects/intake-payload.ts` - IntakePayload type, parseIntakePayload, buildIntakePayload
- `src/projects/intake-payload.test.ts` - 8 tests for payload parsing, backward compat, override, builder

## Decisions Made
- formatProjectsForPlacement is pure text formatting for LLM consumption -- no scoring, no keyword matching per D-04
- IntakePayload extends OrchestratorPayload via intersection type for full backward compatibility
- placementOverride uses optional projectName/projectDir to support both existing and new project overrides (PPL-03)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Placement helpers ready for intake skill to use in LLM prompts
- IntakePayload ready for pipeline consumption by orchestrator and intake skill
- Both modules integrate with existing parseProjectFrontmatter and OrchestratorPayload

---
*Phase: 05-intake-pipeline-templates*
*Completed: 2026-03-29*
