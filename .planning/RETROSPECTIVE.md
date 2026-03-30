# Project Retrospective

*A living document updated after each milestone. Lessons feed forward into future planning.*

## Milestone: v1.0 — Orchestration Layer

**Shipped:** 2026-03-30
**Phases:** 6 | **Plans:** 23 | **Tasks:** ~46

### What Was Built
- Workflow orchestration layer: WF-NNN.md files with Zod schemas, lifecycle management, capability registry
- Orchestrator agent type with decomposition, dispatch, verification, and recovery policies
- Verification engine with 4 types (automatic, human, external, mixed) and side-effect gating
- Recovery chain (retry/decompose/reroute/escalate) with anti-loop budgets and stale claim detection
- Intake pipeline: goal parsing, project placement, template matching, workflow synthesis
- Progress observability: workflow indexes, CLI status, gateway RPC, board UI badges

### What Worked
- Wave-based parallel execution: plans within a wave ran concurrently, cutting wall-clock time significantly
- TDD-first approach in plans: writing tests before implementation caught integration issues early
- Worktree isolation for parallel agents: no merge conflicts between concurrent executors
- Consistent plan structure: objective, interfaces, tasks, acceptance criteria — executors rarely needed clarification
- Building on existing project system primitives rather than creating parallel state

### What Was Inefficient
- Gateway rebuild required for UAT: code was committed but not deployed, blocking human verification until manual rebuild
- Some UAT items were blocked by infrastructure (server not running new code) rather than actual bugs
- Sub-project UI gaps discovered late — storage worked but UI didn't properly handle nesting

### Patterns Established
- `lockedWriteOp` pattern for concurrent file access in project operations
- Factory pattern for cross-module decoupling (`createNotifyUserFn`)
- Static string constants for agent templates and skills (shipped with package, context injected at runtime)
- Three-tier resolution (project > global > bundled) for templates
- Discriminated union result types (`{ ok: true } | { ok: false; error: string }`)

### Key Lessons
1. Plan wave dependencies carefully — Wave 2 plans that depend on Wave 1 outputs need the indexes/types to actually exist, not just be planned
2. Human UAT should be planned alongside the build/deploy cycle — "rebuild and restart gateway" should be a pre-UAT step, not a discovery during testing
3. Sub-project features need end-to-end UI verification, not just storage-level tests

### Cost Observations
- Model mix: ~80% opus (executors), ~20% sonnet (verifiers)
- Average plan execution: 4 minutes
- Total execution across all plans: ~90 minutes wall-clock (with parallelization)
- Notable: parallel wave execution saved ~40% time vs sequential on 2-plan waves

---

## Cross-Milestone Trends

### Process Evolution

| Milestone | Phases | Plans | Key Change |
|-----------|--------|-------|------------|
| v1.0 | 6 | 23 | First milestone — established wave-based parallel execution, TDD plans, worktree isolation |

### Cumulative Quality

| Milestone | Tests Added | Files Modified | LOC Added |
|-----------|-------------|----------------|-----------|
| v1.0 | ~120 | 114 | ~19,500 |

### Top Lessons (Verified Across Milestones)

1. Build-deploy-verify must be a single continuous flow, not separate sessions
2. UI features need full-stack UAT (data + API + rendering), not just API-level tests
