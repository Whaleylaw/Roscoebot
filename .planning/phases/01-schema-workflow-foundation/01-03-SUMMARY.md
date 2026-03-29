---
phase: 01-schema-workflow-foundation
plan: 03
subsystem: projects
tags: [capability-tags, validation, domain-agnostic]

requires:
  - phase: 01-schema-workflow-foundation
    provides: "allowed_capabilities on ProjectFrontmatterSchema, capabilities on TaskFrontmatterSchema (Plan 01)"
provides:
  - "validateCapabilities function for project-level capability enforcement"
  - "STANDARD_CAPABILITIES constant with recommended starter tags"
  - "StandardCapability type union"
affects: [phase-02-orchestration, task-routing, agent-dispatch]

tech-stack:
  added: []
  patterns:
    [
      "Set-based membership validation for capability enforcement",
      "Backward-compatible empty-list bypass pattern",
    ]

key-files:
  created:
    - src/projects/capability-registry.ts
    - src/projects/capability-registry.test.ts
  modified:
    - src/projects/index.ts

key-decisions:
  - "Empty allowed_capabilities means no restriction (backward compat with existing projects)"
  - "Validation returns both valid boolean and unregistered list for actionable error messages"

patterns-established:
  - "Capability registry pattern: project-level allowed list validates task-level tags"
  - "Empty-list bypass: [] means unrestricted, consistent with existing matchCapabilities behavior"

requirements-completed: [CAP-01]

duration: 1min
completed: 2026-03-29
---

# Phase 01 Plan 03: Capability Registry Summary

**validateCapabilities function with project-level capability tag enforcement and STANDARD_CAPABILITIES constant (code, research, ops, review, deploy)**

## Performance

- **Duration:** 1 min
- **Started:** 2026-03-29T13:37:20Z
- **Completed:** 2026-03-29T13:38:38Z
- **Tasks:** 1
- **Files modified:** 3

## Accomplishments

- validateCapabilities enforces strict project-level capability validation (D-14, D-15)
- STANDARD_CAPABILITIES documents the five recommended starter tags (D-16)
- Backward-compatible: empty allowed_capabilities = no restriction
- Exported through src/projects/index.ts barrel alongside existing matchCapabilities

## Task Commits

Each task was committed atomically:

1. **Task 1: Create capability-registry.ts with validateCapabilities and STANDARD_CAPABILITIES**
   - `a8e42a37b` (test: TDD RED - failing tests)
   - `8991505e9` (feat: TDD GREEN - implementation passing all tests)

## Files Created/Modified

- `src/projects/capability-registry.ts` - validateCapabilities function and STANDARD_CAPABILITIES constant
- `src/projects/capability-registry.test.ts` - 10 test cases covering all validation scenarios
- `src/projects/index.ts` - Added capability registry exports to barrel

## Decisions Made

- Empty allowed_capabilities means no restriction (backward compat with existing projects that have no registry)
- Validation returns both valid boolean and unregistered string list for actionable error messages

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- Plan specified `-x` flag for vitest which is not supported; used `--bail 1` instead (no impact on test results)

## User Setup Required

None - no external service configuration required.

## Known Stubs

None - all functionality is fully wired.

## Next Phase Readiness

- Capability registry ready for use in Phase 2 task routing and agent dispatch
- Complements existing matchCapabilities (agent-to-task matching) with validateCapabilities (project-level enforcement)

---

_Phase: 01-schema-workflow-foundation_
_Completed: 2026-03-29_

## Self-Check: PASSED
