---
phase: 5
slug: intake-pipeline-templates
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-29
---

# Phase 5 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `pnpm test -- src/projects/ -t "intake\|template\|workflow"` |
| **Full suite command** | `pnpm test` |
| **Estimated runtime** | ~30 seconds (scoped), ~120 seconds (full) |

---

## Sampling Rate

- **After every task commit:** Run `pnpm test -- src/projects/ -t "intake\|template\|workflow"`
- **After every plan wave:** Run `pnpm test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 05-01-01 | 01 | 1 | TPL-01 | unit | `pnpm test -- src/projects/templates` | ❌ W0 | ⬜ pending |
| 05-01-02 | 01 | 1 | TPL-02 | unit | `pnpm test -- src/projects/templates` | ❌ W0 | ⬜ pending |
| 05-01-03 | 01 | 1 | TPL-03 | unit | `pnpm test -- src/projects/templates` | ❌ W0 | ⬜ pending |
| 05-02-01 | 02 | 1 | PPL-01 | unit | `pnpm test -- src/projects/intake` | ❌ W0 | ⬜ pending |
| 05-02-02 | 02 | 1 | PPL-02 | unit | `pnpm test -- src/projects/intake` | ❌ W0 | ⬜ pending |
| 05-02-03 | 02 | 1 | PPL-03 | unit | `pnpm test -- src/projects/intake` | ❌ W0 | ⬜ pending |
| 05-03-01 | 03 | 2 | SYN-01 | unit | `pnpm test -- src/projects/workflow-synthesis` | ❌ W0 | ⬜ pending |
| 05-03-02 | 03 | 2 | SYN-02 | unit | `pnpm test -- src/projects/workflow-synthesis` | ❌ W0 | ⬜ pending |
| 05-03-03 | 03 | 2 | SYN-03 | integration | `pnpm test -- src/projects/workflow-synthesis` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/projects/templates.test.ts` — extend existing test file with template schema, lookup, and matching tests
- [ ] `src/projects/intake.test.ts` — stubs for intake pipeline (project placement, goal parsing)
- [ ] `src/projects/workflow-synthesis.test.ts` — stubs for workflow generation and WF-NNN file creation

*Existing test infrastructure (vitest, fixtures) covers framework needs.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| LLM template matching quality | TPL-02 | Requires LLM inference for semantic matching | Send 5 diverse goals through intake; verify template selection makes sense |
| Generated workflow coherence | SYN-02 | Generated markdown quality is subjective | Review 3 generated workflows for completeness and structure |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
