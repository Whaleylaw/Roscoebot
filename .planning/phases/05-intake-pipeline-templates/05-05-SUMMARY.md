---
phase: 05-intake-pipeline-templates
plan: 05
subsystem: orchestration
tags: [workflow-synthesis, notify-user, recovery, sessions-send, template-schema]

requires:
  - phase: 05-intake-pipeline-templates/01
    provides: WorkflowTemplateFrontmatterSchema, parseTemplateFrontmatter
  - phase: 05-intake-pipeline-templates/03
    provides: IntakePayload with synthesize flag
provides:
  - synthesizeWorkflow function for heuristic goal-to-workflow decomposition
  - synthesize branch in orchestrateGoal writing WF-NNN.md before task creation (SYN-03)
  - createNotifyUserFn factory wiring NotifyUserFn to sessions_send
affects: [06-progress, orchestrator-integration, recovery-manager]

tech-stack:
  added: []
  patterns: [factory-pattern-for-dependency-injection, heuristic-decomposition]

key-files:
  created:
    - src/projects/notify-user-wire.ts
    - src/projects/notify-user-wire.test.ts
  modified:
    - src/projects/orchestrator.ts
    - src/projects/orchestrator.test.ts

key-decisions:
  - "synthesizeWorkflow uses deterministic heuristic decomposition (not LLM) for workflow structure; LLM decomposition happens later in orchestrateGoal for actual tasks"
  - "createNotifyUserFn uses factory pattern keeping projects/ decoupled from gateway layer; sendFn injected at integration time"
  - "Synthesized workflows marked with template='synthesized' for traceability"

patterns-established:
  - "Factory injection for cross-layer notification: createNotifyUserFn(sendFn) pattern"
  - "Heuristic goal decomposition: sentence splitting with fallback for workflow outline generation"

requirements-completed: [SYN-03]

duration: 4min
completed: 2026-03-30
---

# Phase 05 Plan 05: Synthesize Workflow and NotifyUser Wiring Summary

**Heuristic workflow synthesis with template-schema validation and NotifyUserFn factory wired to sessions_send for escalation delivery**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-30T03:09:35Z
- **Completed:** 2026-03-30T03:13:06Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- synthesizeWorkflow produces valid WorkflowTemplateFrontmatterSchema-compliant markdown from freeform goals
- orchestrateGoal with synthesize=true writes WF-NNN.md to disk before creating tasks (SYN-03 compliance)
- createNotifyUserFn factory enables escalation notifications to reach users via sessions_send instead of silent logging
- Full backward compatibility maintained for existing orchestrateGoal callers

## Task Commits

Each task was committed atomically (TDD: RED then GREEN):

1. **Task 1: synthesizeWorkflow and synthesize branch** - `5f3fb12e3` (test) -> `9f9cb3e88` (feat)
2. **Task 2: Wire NotifyUserFn to sessions_send** - `6a098eb2b` (test) -> `47f165b87` (feat)

## Files Created/Modified
- `src/projects/orchestrator.ts` - Added synthesizeWorkflow function, SynthesizeWorkflowOpts/Result types, synthesize branch in orchestrateGoal
- `src/projects/orchestrator.test.ts` - Added 5 tests for synthesizeWorkflow and synthesize branch
- `src/projects/notify-user-wire.ts` - New createNotifyUserFn factory with formatted escalation messages
- `src/projects/notify-user-wire.test.ts` - 6 tests covering signature, formatting, error handling, session key resolution

## Decisions Made
- synthesizeWorkflow uses deterministic heuristic decomposition (sentence splitting with fallback) rather than LLM calls -- the LLM decomposition into actual tasks happens later in the pipeline
- createNotifyUserFn uses factory injection pattern so projects/ layer stays decoupled from gateway internals; gateway wires sendFn to sessions_send RPC at integration time
- Synthesized workflows get template="synthesized" in the WF file frontmatter for traceability

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Known Stubs
None - all code paths are fully wired with real implementations or test-verified behavior.

## Next Phase Readiness
- Phase 05 plans complete; all intake pipeline, template, and orchestrator synthesis features implemented
- Recovery notification path ready for gateway integration (createNotifyUserFn needs sendFn wired to gateway sessions_send at startup)

---
*Phase: 05-intake-pipeline-templates*
*Completed: 2026-03-30*
