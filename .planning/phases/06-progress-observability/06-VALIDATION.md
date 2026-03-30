---
phase: 6
slug: progress-observability
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-30
---

# Phase 6 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `pnpm test -- {changed_test_file}` |
| **Full suite command** | `pnpm test` |
| **Estimated runtime** | ~60 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm test -- {changed_test_file}`
- **After every plan wave:** Run `pnpm test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 06-01-01 | 01 | 1 | PRG-01 | unit | `pnpm test -- src/projects/index-generator.test.ts` | ❌ W0 | ⬜ pending |
| 06-01-02 | 01 | 1 | PRG-01 | unit | `pnpm test -- src/projects/sync-service.test.ts` | ✅ | ⬜ pending |
| 06-02-01 | 02 | 1 | PRG-03 | unit | `pnpm test -- src/commands/projects.status.test.ts` | ❌ W0 | ⬜ pending |
| 06-02-02 | 02 | 1 | PRG-03 | unit | `pnpm test -- src/gateway/server-methods/projects.test.ts` | ❌ W0 | ⬜ pending |
| 06-03-01 | 03 | 2 | PRG-01 | unit | `pnpm test -- ui/src/ui/views/projects-board.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/projects/index-generator.test.ts` — stubs for generateWorkflowIndex tests (PRG-01)
- [ ] `src/commands/projects.status.test.ts` — stubs for workflow section output (PRG-03)
- [ ] `src/gateway/server-methods/projects.test.ts` — stubs for workflows.list/get RPC handlers (PRG-03)

*Existing infrastructure covers framework and fixtures; only test files for new functionality needed.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Board badge renders `[WF-NNN]` on task cards | PRG-01 | Lit component visual output requires browser | Load board with workflow-linked tasks, verify badge visible on cards |
| WebSocket pushes `workflow:changed` events to UI | PRG-01 | Requires running gateway + connected client | Start gateway, modify workflow file, verify event arrives in UI console |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
