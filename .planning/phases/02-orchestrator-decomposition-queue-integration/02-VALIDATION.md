---
phase: 2
slug: orchestrator-decomposition-queue-integration
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-29
---

# Phase 2 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property               | Value                                               |
| ---------------------- | --------------------------------------------------- |
| **Framework**          | vitest ^4.1.0                                       |
| **Config file**        | `vitest.config.ts`                                  |
| **Quick run command**  | `pnpm test -- src/projects/orchestrator.test.ts -x` |
| **Full suite command** | `pnpm test`                                         |
| **Estimated runtime**  | ~30 seconds (scoped), ~120 seconds (full)           |

---

## Sampling Rate

- **After every task commit:** Run `pnpm test -- src/projects/ -x`
- **After every plan wave:** Run `pnpm test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID  | Plan | Wave | Requirement    | Test Type   | Automated Command                                                             | File Exists       | Status     |
| -------- | ---- | ---- | -------------- | ----------- | ----------------------------------------------------------------------------- | ----------------- | ---------- |
| 02-01-01 | 01   | 1    | ORC-01         | unit        | `pnpm test -- src/config/schema.test.ts -t "agent" -x`                        | Existing (extend) | ⬜ pending |
| 02-01-02 | 01   | 1    | ORC-04, ORC-05 | manual      | Verify workspace file content and AGENTS.md sections                          | Manual            | ⬜ pending |
| 02-01-03 | 01   | 1    | DEC-02         | unit        | `pnpm test -- src/projects/templates.test.ts -t "generateTaskMd" -x`          | ❌ W0             | ⬜ pending |
| 02-02-01 | 02   | 1    | DEC-01, DEC-03 | unit        | `pnpm test -- src/projects/orchestrator.test.ts -t "validates task graph" -x` | ❌ W0             | ⬜ pending |
| 02-02-02 | 02   | 1    | QUE-01, QUE-02 | unit        | `pnpm test -- src/projects/queue-manager.test.ts -t "addTasks" -x`            | ❌ W0             | ⬜ pending |
| 02-02-03 | 02   | 1    | QUE-03, QUE-04 | unit        | `pnpm test -- src/projects/heartbeat-scanner.test.ts -x`                      | Existing          | ⬜ pending |
| 02-02-04 | 02   | 2    | CAP-02, CAP-03 | unit        | `pnpm test -- src/projects/capability-matcher.test.ts -x`                     | Existing          | ⬜ pending |
| 02-03-01 | 03   | 2    | ORC-03         | unit        | `pnpm test -- src/projects/orchestrator.test.ts -t "end-to-end" -x`           | ❌ W0             | ⬜ pending |
| 02-03-02 | 03   | 2    | ORC-02         | integration | Manual: verify sessions_send to orchestrator agent                            | Manual            | ⬜ pending |

_Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky_

---

## Wave 0 Requirements

- [ ] `src/projects/orchestrator.test.ts` — stubs for DEC-01, DEC-03, QUE-01, ORC-03
- [ ] Extend `src/projects/templates.test.ts` — stubs for DEC-02 (generateTaskMd)
- [ ] Extend `src/projects/queue-manager.test.ts` — stubs for QUE-02 (addTasks batch)
- [ ] `src/hooks/bundled/workflow-status/handler.test.ts` — stubs for D-16 hook

_Existing infrastructure covers QUE-03, QUE-04, CAP-02, CAP-03._

---

## Manual-Only Verifications

| Behavior                                                         | Requirement | Why Manual                                | Test Instructions                                                            |
| ---------------------------------------------------------------- | ----------- | ----------------------------------------- | ---------------------------------------------------------------------------- |
| Orchestrator workspace files ship correctly                      | ORC-04      | Static file content, not runtime behavior | Verify IDENTITY.md, SOUL.md, AGENTS.md exist with expected sections          |
| AGENTS.md has Decomposition Standards + Dispatch Policy sections | ORC-05      | Document structure check                  | Read AGENTS.md and verify section headings                                   |
| sessions_send integration with orchestrator                      | ORC-02      | Requires running gateway + agent session  | Start gateway, send goal via sessions_send, verify orchestrator processes it |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
