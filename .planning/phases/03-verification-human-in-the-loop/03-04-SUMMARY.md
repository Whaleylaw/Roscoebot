---
phase: 03-verification-human-in-the-loop
plan: 04
subsystem: ui
tags: [kanban, review-column, verification-evidence, approve, reject, human-in-the-loop, lit, css]

requires:
  - phase: 03-01
    provides: "VerificationRecord type, CheckResult type, review queue section"
  - phase: 03-02
    provides: "completeTask with verification gate, runVerification orchestrator"
  - phase: 03-03
    provides: "Gateway RPC projects.review.approve/reject, CLI review commands"
provides:
  - "Review column in kanban board with warn accent styling"
  - "Review badge on task cards (Needs Review / External Check / Auto Passed)"
  - "Verification evidence display in peek panel with pass/fail check results"
  - "Approve/Reject buttons with inline reject confirmation"
  - "Controller methods wiring UI actions to gateway RPC"
affects: [ui-board, progress-observability]

tech-stack:
  added: []
  patterns: [review-column-ui-pattern, inline-reject-confirmation, verification-evidence-rendering]

key-files:
  modified:
    - ui/src/styles/projects.css
    - ui/src/ui/views/projects-board.ts
    - ui/src/ui/views/projects.ts
    - ui/src/ui/views/projects-dashboard.ts
    - ui/src/ui/controllers/projects.ts
    - ui/src/ui/app-render.ts

key-decisions:
  - "Review badge labels follow UI-SPEC: human->Needs Review, external->External Check, mixed->Auto Passed -- Needs Review"
  - "Reject uses inline confirmation (not modal) per UI-SPEC to keep flow lightweight"
  - "Peek panel includes fallback text for tasks without checkpoint/verification data"

patterns-established:
  - "Review column detection via column.name match applying modifier CSS class"
  - "Inline confirmation pattern for destructive actions (reject) in peek panel"

requirements-completed: [VER-04, HIL-04]

duration: ~20min
completed: 2026-03-29
---

# Phase 3 Plan 4: Board UI Review Column Summary

**Kanban board Review column with warn-accent styling, verification evidence peek panel, and approve/reject buttons with inline reject confirmation**

## Performance

- **Duration:** ~20 min (across checkpoint pause)
- **Started:** 2026-03-29T21:00:00Z
- **Completed:** 2026-03-29T22:30:00Z
- **Tasks:** 3 (2 auto + 1 human-verify checkpoint)
- **Files modified:** 6

## Accomplishments

- Review column renders in kanban board with 2px --warn bottom border accent on header
- Task cards in Review column show badge indicating review type (Needs Review, External Check, Auto Passed)
- Peek panel displays verification evidence with pass/fail indicators per check result
- Approve and Reject buttons appear for review tasks; Reject triggers inline confirmation before RPC call
- Controller wires approve/reject actions through to gateway RPC endpoints from Plan 03
- Additional fixes during verification: vite base path, SPA deep route handling, navigation inference for nested tab routes

## Task Commits

Each task was committed atomically:

1. **Task 1: Add Review column styling and verification evidence CSS** - `cbd1bfc91` (feat)
2. **Task 2: Render Review column, verification evidence, and approve/reject buttons in board UI** - `ffc81affa` (feat)
3. **Task 3: Visual verification checkpoint** - APPROVED by user

## Files Created/Modified

- `ui/src/styles/projects.css` - Review column accent, review badge, verification evidence, action button CSS classes
- `ui/src/ui/views/projects-board.ts` - Review column rendering, review badges, verification evidence in peek, approve/reject buttons with inline reject confirmation
- `ui/src/ui/views/projects.ts` - Parent component wiring onReviewApprove/onReviewReject callbacks to controller
- `ui/src/ui/views/projects-dashboard.ts` - Dashboard integration for review column data
- `ui/src/ui/controllers/projects.ts` - reviewApprove/reviewReject methods, RPC param wiring
- `ui/src/ui/app-render.ts` - Render pipeline updates for review callbacks

## Decisions Made

- Review badge labels follow UI-SPEC mapping: human -> "Needs Review", external -> "External Check", mixed -> "Auto Passed -- Needs Review"
- Inline reject confirmation (not modal dialog) to keep the approval flow lightweight and contextual
- Peek panel shows fallback text ("No verification checks configured") when task lacks verification data

## Deviations from Plan

### Auto-fixed Issues (during checkpoint verification)

**1. [Rule 3 - Blocking] Fixed vite base path for SPA deep routes**
- **Found during:** Task 3 (checkpoint verification)
- **Issue:** Vite default base "./" broke asset loading on deep routes like /projects/my-proj/board
- **Fix:** Changed vite.config.ts base to "/" for absolute asset paths
- **Files modified:** ui/vite.config.ts

**2. [Rule 1 - Bug] Fixed navigation inference for nested tab routes**
- **Found during:** Task 3 (checkpoint verification)
- **Issue:** inferBasePathFromPathname did not recognize nested routes like /projects/my-proj/board
- **Fix:** Updated path inference to handle nested tab routes
- **Files modified:** ui/src/ui/navigation.ts

**3. [Rule 1 - Bug] Fixed URL sync overwriting deep routes**
- **Found during:** Task 3 (checkpoint verification)
- **Issue:** syncUrlWithTab was replacing deep route paths instead of preserving them
- **Fix:** Updated to preserve deep route segments during tab sync
- **Files modified:** ui/src/ui/app-settings.ts

**4. [Rule 1 - Bug] Fixed RPC param name for project reference**
- **Found during:** Task 3 (checkpoint verification)
- **Issue:** Controller used projectDir param but gateway expected project
- **Fix:** Changed param name to match gateway expectation
- **Files modified:** ui/src/ui/controllers/projects.ts

---

**Total deviations:** 4 auto-fixed (3 bugs, 1 blocking)
**Impact on plan:** All fixes necessary for functional UI. Navigation and asset loading fixes ensure the board works on deep routes.

## Known Stubs

- Peek panel task detail section shows limited task metadata; future improvement needed for full task context and approval notes (user noted during review)
- Approve/reject does not yet show loading state or success/error feedback after RPC call

## Issues Encountered

- SPA deep route handling required multiple coordinated fixes across vite config, navigation, and settings modules

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 3 (Verification & Human-in-the-Loop) is now fully complete with all 4 plans delivered
- All verification infrastructure (schema, engine, CLI, gateway RPC, board UI) is in place
- Ready for Phase 4 (Recovery & Resumability) which builds on verification outcomes for retry/escalation logic

---
*Phase: 03-verification-human-in-the-loop*
*Completed: 2026-03-29*
