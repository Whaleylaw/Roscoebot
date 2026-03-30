---
phase: 4
slug: recovery-resumability
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-29
---

# Phase 4 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `pnpm test -- src/projects/ -t "recovery\|resume\|budget\|retry"` |
| **Full suite command** | `pnpm test -- src/projects/` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm test -- src/projects/ -t "recovery\|resume\|budget\|retry"`
- **After every plan wave:** Run `pnpm test -- src/projects/`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 04-01-01 | 01 | 1 | REC-01 | unit | `pnpm test -- src/projects/task-recovery.test.ts` | ❌ W0 | ⬜ pending |
| 04-01-02 | 01 | 1 | REC-02, REC-03 | unit | `pnpm test -- src/projects/task-recovery.test.ts` | ❌ W0 | ⬜ pending |
| 04-01-03 | 01 | 1 | REC-04 | unit | `pnpm test -- src/projects/task-recovery.test.ts` | ❌ W0 | ⬜ pending |
| 04-01-04 | 01 | 1 | REC-05 | unit | `pnpm test -- src/projects/task-recovery.test.ts` | ❌ W0 | ⬜ pending |
| 04-02-01 | 02 | 2 | RSM-01 | unit | `pnpm test -- src/projects/workflow-resume.test.ts` | ❌ W0 | ⬜ pending |
| 04-02-02 | 02 | 2 | RSM-02 | unit | `pnpm test -- src/projects/workflow-resume.test.ts` | ❌ W0 | ⬜ pending |
| 04-02-03 | 02 | 2 | RSM-03 | unit | `pnpm test -- src/projects/workflow-resume.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/projects/task-recovery.test.ts` — stubs for REC-01 through REC-05 (failure classification, retry, decompose, escalation, budget)
- [ ] `src/projects/workflow-resume.test.ts` — stubs for RSM-01 through RSM-03 (resume scanner, checkpoint reconstruction, cross-session state)

*Existing test infrastructure (vitest, fixtures) covers framework needs.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Cross-session resume after process kill | RSM-01 | Requires process restart | 1. Start workflow, 2. Kill process mid-task, 3. Restart, 4. Verify resume from last checkpoint |
| Escalation notification delivery | REC-04 | Depends on channel integration | Trigger 3 consecutive failures, verify user sees escalation message |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
