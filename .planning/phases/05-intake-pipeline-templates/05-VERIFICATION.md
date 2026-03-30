---
phase: 05-intake-pipeline-templates
verified: 2026-03-30T00:00:00Z
status: gaps_found
score: 8/9 must-haves verified
gaps:
  - truth: "All new Phase 5 exports are available from src/projects/index.ts"
    status: partial
    reason: "notify-user-wire exports (createNotifyUserFn, CreateNotifyUserFnOpts) are commented out in index.ts. synthesizeWorkflow, SynthesizeWorkflowOpts, and SynthesizeWorkflowResult are missing from the orchestrator re-export block in index.ts."
    artifacts:
      - path: "src/projects/index.ts"
        issue: "Lines 159-161: notify-user-wire exports commented out as placeholders; never uncommented by Plan 05-05. Orchestrator section at lines 83-98 does not include synthesizeWorkflow or its types."
    missing:
      - "Uncomment `export { createNotifyUserFn } from './notify-user-wire.js'` and `export type { CreateNotifyUserFnOpts } from './notify-user-wire.js'` in src/projects/index.ts"
      - "Add `synthesizeWorkflow` to the orchestrator export block in src/projects/index.ts"
      - "Add `SynthesizeWorkflowOpts` and `SynthesizeWorkflowResult` to the orchestrator type export block in src/projects/index.ts"
---

# Phase 5: Intake Pipeline & Templates Verification Report

**Phase Goal:** Users describe goals in natural language and the system places work in the right project, selects or generates an appropriate workflow, and kicks off orchestration
**Verified:** 2026-03-30
**Status:** gaps_found
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| #   | Truth                                                                                                      | Status      | Evidence                                                                                                                          |
| --- | ---------------------------------------------------------------------------------------------------------- | ----------- | --------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Workflow template frontmatter schema validates template-specific fields                                    | VERIFIED    | `template-schema.ts` exports `WorkflowTemplateFrontmatterSchema`, `WorkflowTemplateStepSchema`, `parseTemplateFrontmatter`        |
| 2   | Three bundled templates exist (code-feature, research-report, ops-runbook) and parse through the schema   | VERIFIED    | `template-bundled.ts` has all three as static strings; all parse through schema (5 tests pass)                                    |
| 3   | Synthesized workflows use the same schema as templates — one schema for both                               | VERIFIED    | `orchestrator.ts` line 440: `WorkflowTemplateFrontmatterSchema.parse(...)` called in `synthesizeWorkflow`                         |
| 4   | Template resolver searches project-local, global, bundled tiers in order and returns the first match      | VERIFIED    | `template-resolver.ts` implements three-tier lookup; 8 tests pass including precedence and ENOENT handling                        |
| 5   | Templates can be listed across all tiers with tier origin indicated                                        | VERIFIED    | `listAllTemplates` returns `TemplateSummary[]` with `tier` field; deduplication by name confirmed in tests                        |
| 6   | A synthesized workflow can be saved as a reusable template by stripping project-specific values            | VERIFIED    | `template-save.ts` strips `id, status, tasks, created, updated, goal, goal_check, template`; 7 tests pass                        |
| 7   | Project placement produces structured summaries of active projects for LLM reasoning (no keyword heuristics) | VERIFIED | `placement.ts` explicitly documents `NO keyword heuristics, NO algorithmic scoring`; no regex/fuzzy matching in implementation    |
| 8   | When synthesize is true, orchestrator generates a workflow and writes WF-NNN.md before execution begins   | VERIFIED    | `orchestrateGoal` synthesize branch writes WF file before `createTaskBatch`; SYN-03 test confirms file exists on disk first       |
| 9   | All new Phase 5 exports are available from src/projects/index.ts                                          | FAILED      | `createNotifyUserFn` and `CreateNotifyUserFnOpts` commented out; `synthesizeWorkflow`, `SynthesizeWorkflowOpts`, `SynthesizeWorkflowResult` not in orchestrator export block |

**Score:** 8/9 truths verified

### Required Artifacts

| Artifact                               | Expected                                                                          | Status     | Details                                                                                        |
| -------------------------------------- | --------------------------------------------------------------------------------- | ---------- | ---------------------------------------------------------------------------------------------- |
| `src/projects/template-schema.ts`      | WorkflowTemplateFrontmatterSchema, WorkflowTemplateStepSchema, parseTemplateFrontmatter | VERIFIED | All three exports present; 145 lines of substantive Zod schema + parser implementation         |
| `src/projects/template-bundled.ts`     | BUNDLED_TEMPLATES, getBundledTemplate, listBundledTemplates                       | VERIFIED   | All three exports present; three full template constants with YAML frontmatter                 |
| `src/projects/template-resolver.ts`    | resolveTemplate, listAllTemplates                                                 | VERIFIED   | Both exports present; three-tier lookup with ENOENT handling and deduplication                 |
| `src/projects/template-save.ts`        | saveAsTemplate                                                                    | VERIFIED   | Export present; strips instance fields, validates through schema, writes atomically             |
| `src/projects/placement.ts`            | formatProjectsForPlacement, PlacementSuggestion type                              | VERIFIED   | Both exports present; no keyword heuristics confirmed                                          |
| `src/projects/intake-payload.ts`       | IntakePayload, parseIntakePayload, buildIntakePayload                             | VERIFIED   | All three exports present; backward-compatible with OrchestratorPayload                        |
| `src/projects/intake-skill.ts`         | INTAKE_SKILL_MD, getIntakeSkillContent                                            | VERIFIED   | Both exports present; all four required sections in skill content                              |
| `src/projects/notify-user-wire.ts`     | createNotifyUserFn, CreateNotifyUserFnOpts                                        | VERIFIED   | File exists and is substantive; exports present in file — but NOT re-exported from barrel       |
| `src/projects/orchestrator.ts`         | synthesizeWorkflow, synthesize branch in orchestrateGoal                          | VERIFIED   | synthesizeWorkflow exported from file; synthesize branch writes WF-NNN.md before tasks         |
| `src/projects/index.ts`               | Barrel exports for all Phase 5 symbols                                            | PARTIAL    | 7 of 9 Phase 5 modules wired; notify-user-wire commented out; synthesizeWorkflow missing        |

### Key Link Verification

| From                              | To                              | Via                                    | Status  | Details                                                                |
| --------------------------------- | ------------------------------- | -------------------------------------- | ------- | ---------------------------------------------------------------------- |
| `template-bundled.ts`             | `template-schema.ts`            | import parseTemplateFrontmatter        | WIRED   | Line 1: `import { parseTemplateFrontmatter }` confirmed                |
| `template-resolver.ts`            | `template-bundled.ts`           | import getBundledTemplate, listBundledTemplates | WIRED | Lines 4: both imports present and used in tier-3 lookup          |
| `template-resolver.ts`            | `template-schema.ts`            | import parseTemplateFrontmatter        | WIRED   | Lines 5-6: imports present; used in tryReadTemplate                    |
| `template-save.ts`                | `template-schema.ts`            | WorkflowTemplateFrontmatterSchema validation | WIRED | Line 5 import; line 131 `.safeParse()` call                      |
| `intake-payload.ts`               | `orchestrator.ts`               | extends OrchestratorPayload type       | WIRED   | Line 1: `import type { OrchestratorPayload }` confirmed               |
| `placement.ts`                    | `frontmatter.ts`                | parseProjectFrontmatter                | WIRED   | Line 3 import; used in readProjectSummaries at line 49                 |
| `orchestrator.ts`                 | `template-schema.ts`            | WorkflowTemplateFrontmatterSchema      | WIRED   | Lines 10-12: import present; `.parse()` called in synthesizeWorkflow   |
| `orchestrator.ts`                 | `templates.ts`                  | generateWorkflowMd                     | WIRED   | Line 13 import; used at line 540 in orchestrateGoal                   |
| `notify-user-wire.ts`             | `recovery-manager.ts`           | NotifyUserFn type                      | WIRED   | Line 11: `import type { NotifyUserFn }` confirmed                     |
| `index.ts`                        | `notify-user-wire.ts`           | barrel export                          | NOT_WIRED | Lines 159-161 are commented out                                     |
| `index.ts`                        | `orchestrator.ts` (synthesize)  | synthesizeWorkflow barrel export       | NOT_WIRED | synthesizeWorkflow not in the orchestrator export block at lines 83-98 |

### Data-Flow Trace (Level 4)

Phase 5 delivers primarily library/utility functions and a skill instruction document rather than UI rendering components. The core data flows are:

| Artifact                   | Data Variable        | Source                              | Produces Real Data | Status    |
| -------------------------- | -------------------- | ----------------------------------- | ------------------ | --------- |
| `template-resolver.ts`     | resolvedTemplate     | fs.readFile + parseTemplateFrontmatter | Yes (live file reads) | FLOWING |
| `placement.ts`             | summaries            | fs.readFile PROJECT.md + parseProjectFrontmatter | Yes (live file reads) | FLOWING |
| `orchestrator.ts:synthesizeWorkflow` | frontmatter | heuristic decomposition + WorkflowTemplateFrontmatterSchema.parse | Yes (deterministic) | FLOWING |
| `notify-user-wire.ts`      | message              | notifyOpts fields → formatted string → sendFn | Yes (injected sendFn) | FLOWING |

### Behavioral Spot-Checks

| Behavior                                             | Command                                                                                            | Result        | Status  |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ------------- | ------- |
| 102 Phase 5 tests pass                               | `pnpm test -- src/projects/template-schema.test.ts ... notify-user-wire.test.ts`                  | 102/102 pass  | PASS    |
| No type errors in Phase 5 source files               | `pnpm tsgo 2>&1 \| grep src/projects/template\|placement\|intake\|notify`                         | No output     | PASS    |
| synthesizeWorkflow produces schema-valid output      | Verified in `orchestrator.test.ts > synthesizeWorkflow > output parses through schema`             | Test passes   | PASS    |
| synthesize=true writes WF file before task creation  | Verified in `orchestrator.test.ts > orchestrateGoal with synthesize > SYN-03`                     | Test passes   | PASS    |
| index.ts contains notify-user-wire export            | `grep -n notify-user-wire src/projects/index.ts`                                                  | Commented out | FAIL    |
| index.ts contains synthesizeWorkflow export          | `grep -n synthesizeWorkflow src/projects/index.ts`                                                | Not found     | FAIL    |

### Requirements Coverage

| Requirement | Source Plan | Description                                                                        | Status    | Evidence                                                                          |
| ----------- | ----------- | ---------------------------------------------------------------------------------- | --------- | --------------------------------------------------------------------------------- |
| PPL-01      | 05-03       | Orchestrator determines whether work belongs in existing/new/sub-project           | SATISFIED | `placement.ts` provides `readProjectSummaries` + `formatProjectsForPlacement`; `intake-payload.ts` carries `placementOverride` field |
| PPL-02      | 05-03       | Project placement uses heuristics: keyword/capability match against active projects | NOTE      | Requirement says "heuristics" but D-04 in CONTEXT.md intentionally overrides to LLM-driven reasoning. Implementation provides LLM-ready formatted summaries, no keyword scoring. This deviation is documented in RESEARCH.md line 64 and is the correct behavior per project decisions. Marked satisfied per REQUIREMENTS.md traceability. |
| PPL-03      | 05-03       | User can override automatic project placement                                      | SATISFIED | `IntakePayload.placementOverride` field; `intake-skill.ts` references `placementOverride` and PPL-03 by name; test confirms field presence |
| TPL-01      | 05-01       | Reusable workflow templates exist as markdown files with parameterized frontmatter | SATISFIED | `WorkflowTemplateFrontmatterSchema` with `params` field; `saveAsTemplate` writes them to disk |
| TPL-02      | 05-01       | Templates cover common work types (code feature, research report, ops runbook)     | SATISFIED | `BUNDLED_TEMPLATES` map has all three; each with typed params and steps           |
| TPL-03      | 05-02       | Orchestrator matches user goals to templates and configures for specific request    | SATISFIED | `resolveTemplate` (three-tier lookup) + `listAllTemplates` for matching; `intake-skill.ts` Step 4 describes template matching flow |
| SYN-01      | 05-04       | When no template matches, orchestrator generates tailored workflow from natural language | SATISFIED | `IntakePayload.synthesize` flag set to `true`; `intake-skill.ts` Step 4: "If no template matches, mark for synthesis by setting `synthesize: true`" |
| SYN-02      | 05-04       | Synthesized workflows follow the same structure as templates                       | SATISFIED | `synthesizeWorkflow` validates through `WorkflowTemplateFrontmatterSchema`; D-16/D-21 comment in `intake-skill.ts` and `template-schema.ts` |
| SYN-03      | 05-05       | Generated workflows are written to disk before execution begins                    | SATISFIED | `orchestrateGoal` synthesize branch calls `writeFileAtomic(wfPath, wfContent)` before `createTaskBatch`; test confirms file exists on disk first |

### Anti-Patterns Found

| File                          | Line    | Pattern                                             | Severity | Impact                                                             |
| ----------------------------- | ------- | --------------------------------------------------- | -------- | ------------------------------------------------------------------ |
| `src/projects/index.ts`       | 159-161 | Commented-out export block left as placeholder      | Blocker  | `createNotifyUserFn` and `CreateNotifyUserFnOpts` are not importable from the public barrel; any gateway integration point that does `import { createNotifyUserFn } from "src/projects/index.js"` will fail to compile |
| `src/projects/index.ts`       | 83-98   | Missing synthesizeWorkflow in orchestrator section  | Warning  | `synthesizeWorkflow` is exported from `orchestrator.ts` directly but not re-exported from the barrel; callers using the barrel cannot access it |

### Human Verification Required

None — all verifiable behaviors were confirmed programmatically. The intake skill (INTAKE_SKILL_MD) is a conversational instruction document; its quality for actual LLM-guided intake flows would require runtime testing, but all structural requirements (sections, handoff format, field references) are verified by tests.

### Gaps Summary

One gap is blocking full goal achievement: the projects barrel (`src/projects/index.ts`) does not complete the wiring for two Phase 5 symbols.

**Gap 1 — Commented-out notify-user-wire exports (blocker):** Plan 05-04 left `createNotifyUserFn` and `CreateNotifyUserFnOpts` commented out as a placeholder for Plan 05-05 to uncomment. Plan 05-05 created `notify-user-wire.ts` and its tests but did not uncomment the barrel lines. The file and its exports exist and all tests pass, but the symbols are not accessible via the barrel. Any code importing from `src/projects` (the public surface) cannot reach `createNotifyUserFn`.

**Gap 2 — Missing synthesizeWorkflow in barrel (warning):** The orchestrator export block at lines 83-98 was written before `synthesizeWorkflow` existed. Plan 05-05 added `synthesizeWorkflow`, `SynthesizeWorkflowOpts`, and `SynthesizeWorkflowResult` to `orchestrator.ts` but did not update the barrel re-export to include them.

**Fix required:** Both gaps are one-line fixes in `src/projects/index.ts`:
1. Uncomment lines 160-161 for `notify-user-wire`
2. Add `synthesizeWorkflow` to the `export { ... } from "./orchestrator.js"` block
3. Add `SynthesizeWorkflowOpts` and `SynthesizeWorkflowResult` to the `export type { ... } from "./orchestrator.js"` block

All underlying implementations are correct and fully tested. This is purely a barrel wiring omission.

---

_Verified: 2026-03-30_
_Verifier: Claude (gsd-verifier)_
