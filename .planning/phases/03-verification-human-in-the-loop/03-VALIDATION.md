---
phase: 3
slug: verification-human-in-the-loop
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-29
---

# Phase 3 -- Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property               | Value                                          |
| ---------------------- | ---------------------------------------------- |
| **Framework**          | vitest                                         |
| **Config file**        | `vitest.config.ts`                             |
| **Quick run command**  | `pnpm test -- src/projects/ -t "verification"` |
| **Full suite command** | `pnpm test -- src/projects/`                   |
| **Estimated runtime**  | ~15 seconds                                    |

---

## Sampling Rate

- **After every task commit:** Run `pnpm test -- src/projects/ -t "verification"`
- **After every plan wave:** Run `pnpm test -- src/projects/`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID  | Plan | Wave | Requirement | Test Type   | Automated Command                                                         | File Exists | Status  |
| -------- | ---- | ---- | ----------- | ----------- | ------------------------------------------------------------------------- | ----------- | ------- |
| 03-01-01 | 01   | 1    | VER-01      | unit        | `pnpm test -- src/projects/verification.test.ts`                          | W0          | pending |
| 03-01-02 | 01   | 1    | VER-04      | unit        | `pnpm test -- src/projects/queue-manager.test.ts`                         | existing    | pending |
| 03-02-01 | 02   | 2    | VER-02      | unit        | `pnpm test -- src/projects/verification.test.ts -t "runVerification"`     | W0          | pending |
| 03-02-02 | 02   | 2    | VER-03      | unit        | `pnpm test -- src/hooks/bundled/verification-hook.test.ts -t "human"`     | W0          | pending |
| 03-02-03 | 02   | 2    | VER-05      | unit        | `pnpm test -- src/hooks/bundled/verification-hook.test.ts -t "automatic"` | W0          | pending |
| 03-02-04 | 02   | 2    | HIL-01      | unit        | `pnpm test -- src/hooks/bundled/verification-hook.test.ts`                | W0          | pending |
| 03-02-05 | 02   | 2    | HIL-02      | unit        | `pnpm test -- src/hooks/bundled/verification-hook.test.ts -t "none"`      | W0          | pending |
| 03-02-06 | 02   | 2    | HIL-03      | unit        | `pnpm test -- src/hooks/bundled/verification-hook.test.ts -t "irrevers"`  | W0          | pending |
| 03-02-07 | 02   | 2    | VER-05      | unit        | `pnpm test -- src/projects/task-lifecycle.test.ts`                        | W0          | pending |
| 03-03-01 | 03   | 2    | HIL-04      | unit        | `pnpm test -- src/commands/projects.review.test.ts`                       | W0          | pending |
| 03-03-02 | 03   | 2    | HIL-04      | integration | `pnpm check && pnpm tsgo`                                                 | n/a         | pending |
| 03-04-01 | 04   | 3    | VER-04      | visual      | `pnpm tsgo`                                                               | n/a         | pending |
| 03-04-02 | 04   | 3    | HIL-04      | visual      | Human visual inspection                                                   | n/a         | pending |

_Status: pending . green . red . flaky_

---

## Wave 0 Requirements

- [ ] `src/projects/verification.test.ts` -- stubs for check runners and runVerification
- [ ] `src/hooks/bundled/verification-hook.test.ts` -- stubs for verification hook gate logic
- [ ] `src/projects/task-lifecycle.test.ts` -- stubs for completeTask entry point
- [ ] `src/commands/projects.review.test.ts` -- stubs for review approve/reject commands
- [ ] `src/projects/queue-manager.test.ts` -- extend with Review section round-trip tests (existing file)

_Existing vitest infrastructure covers framework needs._

---

## Manual-Only Verifications

| Behavior                                        | Requirement | Why Manual                    | Test Instructions                                                                          |
| ----------------------------------------------- | ----------- | ----------------------------- | ------------------------------------------------------------------------------------------ |
| Review column renders correctly on kanban board | HIL-04      | Requires visual inspection    | Open board UI, verify Review column accent, badges, evidence display, approve/reject flow  |
| Human approval prompt renders correctly in CLI  | HIL-03      | Requires interactive terminal | Run task with `approval_required: true`, verify prompt appears with action summary and Y/N |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
