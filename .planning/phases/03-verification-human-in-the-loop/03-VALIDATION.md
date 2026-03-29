---
phase: 3
slug: verification-human-in-the-loop
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-29
---

# Phase 3 — Validation Strategy

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

| Task ID  | Plan | Wave | Requirement | Test Type   | Automated Command                                                     | File Exists | Status     |
| -------- | ---- | ---- | ----------- | ----------- | --------------------------------------------------------------------- | ----------- | ---------- |
| 03-01-01 | 01   | 1    | VER-01      | unit        | `pnpm test -- src/projects/verification.test.ts`                      | ❌ W0       | ⬜ pending |
| 03-01-02 | 01   | 1    | VER-02      | unit        | `pnpm test -- src/projects/verification.test.ts -t "automatic"`       | ❌ W0       | ⬜ pending |
| 03-01-03 | 01   | 1    | VER-03      | unit        | `pnpm test -- src/projects/verification.test.ts -t "evidence"`        | ❌ W0       | ⬜ pending |
| 03-02-01 | 02   | 1    | HIL-01      | unit        | `pnpm test -- src/projects/human-approval.test.ts`                    | ❌ W0       | ⬜ pending |
| 03-02-02 | 02   | 1    | HIL-02      | unit        | `pnpm test -- src/projects/human-approval.test.ts -t "classify"`      | ❌ W0       | ⬜ pending |
| 03-02-03 | 02   | 1    | HIL-03      | unit        | `pnpm test -- src/projects/human-approval.test.ts -t "pause"`         | ❌ W0       | ⬜ pending |
| 03-02-04 | 02   | 1    | HIL-04      | unit        | `pnpm test -- src/projects/human-approval.test.ts -t "auto-proceed"`  | ❌ W0       | ⬜ pending |
| 03-03-01 | 03   | 2    | VER-04      | unit        | `pnpm test -- src/projects/verification.test.ts -t "retry"`           | ❌ W0       | ⬜ pending |
| 03-03-02 | 03   | 2    | VER-05      | integration | `pnpm test -- src/projects/verification.test.ts -t "completion gate"` | ❌ W0       | ⬜ pending |

_Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky_

---

## Wave 0 Requirements

- [ ] `src/projects/verification.test.ts` — stubs for VER-01 through VER-05
- [ ] `src/projects/human-approval.test.ts` — stubs for HIL-01 through HIL-04

_Existing vitest infrastructure covers framework needs._

---

## Manual-Only Verifications

| Behavior                                       | Requirement | Why Manual                    | Test Instructions                                                                          |
| ---------------------------------------------- | ----------- | ----------------------------- | ------------------------------------------------------------------------------------------ |
| Human approval prompt renders correctly in CLI | HIL-03      | Requires interactive terminal | Run task with `approval_required: true`, verify prompt appears with action summary and Y/N |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
