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
| **Quick run command** | `pnpm test -- src/projects/ -t "recovery\|resume\|budget\|retry\|stale"` |
| **Full suite command** | `pnpm test -- src/projects/` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm test -- src/projects/ -t "recovery\|resume\|budget\|retry\|stale"`
- **After every plan wave:** Run `pnpm test -- src/projects/`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 04-01-01 | 01 | 1 | REC-01, REC-02, REC-03 | unit | `pnpm test -- src/projects/recovery-types.test.ts` | No (W0) | pending |
| 04-01-02 | 01 | 1 | REC-04, REC-05 | unit | `pnpm test -- src/projects/checkpoint.test.ts src/projects/schemas.test.ts` | Yes | pending |
| 04-02-01 | 02 | 2 | REC-01, REC-02, REC-03, REC-04 | unit | `pnpm test -- src/projects/recovery-manager.test.ts` | No (W0) | pending |
| 04-02-02 | 02 | 2 | REC-01, REC-04 | unit | `pnpm test -- src/projects/task-lifecycle.test.ts` | Yes | pending |
| 04-03-01 | 03 | 2 | REC-04, REC-05 | unit | `pnpm test -- src/projects/heartbeat-scanner.test.ts` | Yes | pending |
| 04-03-02 | 03 | 2 | D-13 | unit | `pnpm test -- src/projects/heartbeat-scanner.test.ts -t "stale"` | Yes | pending |
| 04-04-01 | 04 | 3 | RSM-01, RSM-02, RSM-03 | unit | `pnpm test -- src/projects/workflow-resume.test.ts` | No (W0) | pending |
| 04-04-02 | 04 | 3 | REC-04 | unit | `pnpm test -- src/hooks/bundled/workflow-status-hook.test.ts` | Yes | pending |

*Status: pending / green / red / flaky*

---

## Wave 0 Requirements

- [ ] `src/projects/recovery-types.test.ts` -- stubs for selectRecoveryStrategy covering retry, decompose, reroute, escalate paths
- [ ] `src/projects/recovery-manager.test.ts` -- stubs for executeRecoveryStrategy covering retry, escalate, notifyUser, budget-exhausted
- [ ] `src/projects/workflow-resume.test.ts` -- stubs for scanActiveWorkflows covering resume, reconstruction, interrupted tasks
- [ ] Extend `src/projects/heartbeat-scanner.test.ts` -- stubs for budget gate, backoff, stale claim detection
- [ ] Extend `src/projects/task-lifecycle.test.ts` -- stubs for failTask entry point and hook ordering

*(Existing test infrastructure covers checkpoint, queue-manager, schemas, frontmatter parsing. No framework install needed.)*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Cross-session resume after process kill | RSM-01 | Requires process restart | 1. Start workflow, 2. Kill process mid-task, 3. Restart, 4. Verify resume from last checkpoint |
| Escalation notification delivery | REC-04 | Depends on gateway sessions_send wiring | Trigger 3 consecutive failures, verify user sees escalation message |
| Stale claim liveness ping | D-13 | Requires gateway RPC and active agent | Claim a task, let it go stale, verify ping attempt and release |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
