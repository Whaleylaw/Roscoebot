# Domain Pitfalls

**Domain:** AI agent workflow orchestration layer (brownfield, on existing project/task/queue system)
**Researched:** 2026-03-28

---

## Critical Pitfalls

Mistakes that cause rewrites, data corruption, or architectural dead ends.

### Pitfall 1: Schema Bloat on the Task Model

**What goes wrong:** The orchestration layer adds too many frontmatter fields to `TaskFrontmatterSchema` at once -- `workflow`, `verification_type`, `side_effect_class`, `approval_required`, `estimated_size`, `execution_mode` are all listed in PROJECT.md as desired. Dumping all six into the existing Zod schema immediately creates a coupling problem: every existing task file, queue parser round-trip, index generator, and board UI must handle the new fields or break. The schema grows from a clean 12-field task model to an 18-field model where half the fields are only relevant to orchestrated work.

**Why it happens:** Desire to define the "full" orchestration model upfront rather than adding fields incrementally as they prove necessary. The existing `TaskFrontmatterSchema` uses `z.object()` (not `.passthrough()`), so unknown fields are stripped on parse -- adding fields requires schema changes, not just convention.

**Consequences:**

- Every `parseTaskFrontmatter` call must handle new optional fields, including in heartbeat scanner, capability matcher, queue manager, index generator, and all CLI commands.
- Board/UI surfaces (kanban, `.index/` JSON) must render or ignore new fields without breaking existing views.
- Migration burden: existing task files lack the new fields, requiring defaults that may silently misrepresent task state.

**Warning signs:**

- PR adds more than 2-3 new frontmatter fields in a single phase.
- New fields have no consumer yet (added "for future use").
- Tests start needing boilerplate to satisfy required fields that most tasks do not use.

**Prevention:**

- Add fields one at a time, only when the consuming code lands in the same phase.
- Use `.passthrough()` or a separate `WorkflowTaskExtensions` schema that merges with `TaskFrontmatterSchema` only in orchestration contexts, leaving the base schema untouched.
- Keep all new fields optional with safe defaults so existing tasks parse without migration.

**Detection:** Count frontmatter fields added per phase. If more than 3 land without corresponding read/write consumers, stop and reassess.

**Phase relevance:** Phase 1 (schema foundations) -- get this wrong early and everything downstream inherits the bloat.

---

### Pitfall 2: Orchestrator Becomes a Bottleneck / God Agent

**What goes wrong:** The orchestration agent accumulates too many responsibilities: intake parsing, project placement, workflow selection, workflow synthesis, task decomposition, dispatch coordination, verification, and recovery. A single orchestrator agent type tries to do all of these in one context window, one prompt, one session. It becomes the `attempt.ts` of orchestration -- a 3,000+ LOC god-module that nobody can safely modify.

**Why it happens:** The "dedicated agent type" decision in PROJECT.md naturally gravitates toward a single orchestrator that owns the entire loop. Early prototypes work because the scope is small. By phase 3-4, the orchestrator prompt is enormous, the context window is saturated, and the agent cannot reliably coordinate complex workflows because it is trying to reason about too many concerns simultaneously.

**Consequences:**

- Context window exhaustion: orchestrator spends tokens on intake/placement logic when it should be focused on dispatch/verification.
- Single point of failure: if the orchestrator crashes or loses context, the entire workflow stalls.
- The codebase already has a fragile god-file (`attempt.ts` at 3,234 LOC) -- replicating this pattern in orchestration doubles the maintenance burden.
- Accuracy compounding: if the orchestrator makes decisions at 85% accuracy per step across a 10-step workflow, end-to-end success drops to ~20%.

**Warning signs:**

- Orchestrator prompt exceeds 4,000 tokens of system instructions.
- Orchestrator agent type handles both "what to do" (planning) and "make it happen" (dispatch) in the same session.
- Adding a new orchestration capability requires modifying the orchestrator's core loop.

**Prevention:**

- Separate concerns into distinct phases with clear handoff points: intake/placement is one operation, decomposition is another, dispatch/monitoring is a third.
- The orchestrator should be a thin coordinator that delegates to specialized sub-operations, not a monolith that reasons about everything.
- Cap orchestrator prompt size. If it grows beyond a threshold, that is a signal to split.

**Detection:** Measure orchestrator prompt size and step count per workflow. If either grows linearly with feature additions, the architecture needs splitting.

**Phase relevance:** Phase 2 (orchestrator agent type) -- the architectural boundary must be right from inception.

---

### Pitfall 3: Infinite Retry / Decompose-Further Loops

**What goes wrong:** The recovery policy specifies "retry, decompose further, reroute, block, or escalate" but without hard budget limits, the orchestrator enters loops: a task fails, it retries (same result), it decomposes into smaller tasks (which also fail for the same root cause), it retries those, and the system burns tokens and time without progress. This is the single most common production failure in agent orchestration systems.

**Why it happens:** Three specific loop patterns apply here:

1. **Same-tool retry loop:** Task execution fails, orchestrator retries with identical or near-identical instructions. The underlying cause (missing capability, bad assumption, external service down) does not change between retries.
2. **Decompose-retry oscillation:** Orchestrator decomposes a failed task into subtasks, subtasks fail, orchestrator decomposes further. Each decomposition level adds overhead without addressing the root failure.
3. **Semantic re-planning loop:** Orchestrator "plans" repeatedly -- rephrasing the same workflow, re-summarizing known state -- consuming tokens without making progress.

**Consequences:**

- Token/cost explosion: a single stuck workflow can consume 10-100x normal token budget.
- Queue starvation: other tasks cannot claim agents while the stuck workflow holds them.
- Checkpoint pollution: failed approaches accumulate in `CheckpointData.failed_approaches` without bound, eventually exceeding useful context.

**Warning signs:**

- `failed_approaches` array in a checkpoint exceeds 3 entries.
- Same task ID appears in "Claimed" section of queue multiple times within an hour.
- Token cost per workflow exceeds 3x the median.

**Prevention:**

- **Hard step budget per task:** max 3 retries, then escalate. Not configurable by the orchestrator itself.
- **Decomposition depth limit:** max 2 levels of sub-decomposition before mandatory human escalation.
- **Repeated-action detection:** hash (task description + approach) and reject duplicates.
- **Progress detection:** if N consecutive steps produce no new artifacts or state changes, halt and escalate.
- **Token budget per workflow:** hard ceiling, enforced outside the agent, non-negotiable.

**Detection:** Instrument retry count, decomposition depth, and tokens-per-workflow from day one. Alert on any workflow exceeding 2x median cost.

**Phase relevance:** Phase 3 (recovery policy) -- but the budget enforcement infrastructure must exist before any retry logic ships.

---

### Pitfall 4: Decomposition Quality -- Too Vague or Too Granular

**What goes wrong:** The LLM decomposes user goals into tasks that are either too vague to execute without significant interpretation ("implement the authentication system") or too granular to be worth the coordination overhead ("add import statement to line 3 of auth.ts"). Both failure modes are common and neither is obviously wrong at decomposition time.

**Why it happens:**

- **Too vague:** The decomposer lacks domain context or the goal is genuinely ambiguous. The resulting tasks require the executor to make architectural decisions that should have been made during planning.
- **Too granular:** The decomposer over-specifies implementation details, producing dozens of trivial tasks whose coordination overhead exceeds the cost of doing the work as a single unit. Fine-grained decomposition also creates complex dependency graphs that are hard to parallelize correctly.

**Consequences:**

- Vague tasks produce inconsistent results across different executor agents, requiring rework.
- Granular tasks create dependency explosion: 20 tasks with 15 dependency edges means the queue manager spends more time checking `checkAllDepsDone` than agents spend executing.
- The existing `depends_on` field in `TaskFrontmatterSchema` uses a flat array of TASK-IDs. Complex dependency graphs (diamond dependencies, conditional dependencies) do not fit this model without schema changes -- and schema changes trigger Pitfall 1.

**Warning signs:**

- Tasks regularly fail their first execution attempt due to ambiguity.
- Average task count per workflow exceeds 15.
- Dependency graphs have depth greater than 4.
- Executors ask clarifying questions more than 20% of the time.

**Prevention:**

- Define a "task authoring standard" that specifies concrete fields: objective, context, action guidance, success criteria, verification method. Enforce these structurally, not by convention.
- Set guardrails on decomposition output: minimum 2 tasks, maximum 10 tasks per workflow level. If the decomposer wants more than 10, it must group into sub-workflows.
- Require each task to have a testable success criterion -- if the decomposer cannot state one, the task is too vague.
- Use the existing `estimated_size` field (once added) to flag tasks that are suspiciously small (< 5 min) or large (> 4 hours) for review.

**Detection:** Track task-level metrics: first-attempt success rate, average clarification requests, dependency graph depth/width.

**Phase relevance:** Phase 2 (decomposition) -- this is where the quality bar is set. Poor decomposition quality propagates through every downstream phase.

---

### Pitfall 5: Verification Overhead Exceeds Execution Cost

**What goes wrong:** The verification framework (automatic, human, external, mixed) adds so much overhead that verifying a task takes longer than executing it. Every task gets verification, including trivial ones. Human verification creates approval bottlenecks. Automatic verification produces false positives that require human triage anyway.

**Why it happens:** The natural instinct is to verify everything -- the PROJECT.md lists verification as a core requirement. But verification has a cost curve: trivial tasks (rename a file, update a version number) do not need multi-step verification, while high-risk tasks (database migration, API contract change) genuinely do. Treating all tasks equally either under-verifies risky work or over-verifies trivial work.

**Consequences:**

- Approval bottleneck: human verification becomes the critical path, defeating the purpose of autonomous orchestration.
- False positive fatigue: automatic verification that frequently flags correct work trains operators to ignore verification results.
- Queue stall: tasks in "review" status pile up waiting for verification while "available" tasks go unclaimed because the pipeline is backed up at the verification stage.

**Warning signs:**

- More than 30% of tasks are in "review" status at any given time.
- Average time-in-review exceeds average time-in-progress.
- Human approval is required for tasks with no side effects.

**Prevention:**

- Tier verification by `side_effect_class`: read-only tasks get automatic verification only. Mutation tasks get automatic + human spot-check. Destructive tasks get mandatory human approval.
- Default to automatic verification; require explicit opt-in for human verification.
- Automatic verification must produce binary pass/fail with evidence, not ambiguous "might be wrong" signals.
- Set a time budget for verification: if automatic verification cannot complete within 30 seconds, it is too complex and should be simplified or skipped.

**Detection:** Measure verification-time-to-execution-time ratio per task. If the ratio exceeds 0.5 for non-destructive tasks, the verification policy is too heavy.

**Phase relevance:** Phase 3-4 (verification framework) -- design the tiering from the start, not as an optimization after the fact.

---

## Moderate Pitfalls

### Pitfall 6: Workflow Files Create a Parallel State System

**What goes wrong:** First-class workflow files (`workflows/WF-NNN.md`) within project directories become a second source of truth alongside `queue.md` and task frontmatter. The workflow file says the workflow is "in progress," the queue says task TASK-003 is "available," and the task frontmatter says it is "blocked." Three files, three different views of reality.

**Why it happens:** Workflow files are a new entity type layered on top of an existing project/task/queue system that was not designed for them. The existing system has clear state ownership: task status lives in frontmatter, queue position lives in `queue.md`. Adding workflow files introduces a third state location without clear precedence rules.

**Prevention:**

- Workflow files should be declarative templates, not stateful entities. Workflow progress should be derived from constituent task states, never independently tracked.
- If a workflow needs a "status" field, compute it from task states at read time (all tasks done = workflow done, any task blocked = workflow blocked).
- Never allow workflow files to be mutated during execution -- they are plans, not state.
- The `queue.md` + task frontmatter remain the sole source of truth for execution state.

**Detection:** If any code path writes to a workflow file during task execution (not during planning/decomposition), that is a state coherence violation.

**Phase relevance:** Phase 1 (workflow file format) -- the read-only-during-execution constraint must be established at design time.

---

### Pitfall 7: Losing the Simplicity of Queue-Based Claiming

**What goes wrong:** The existing heartbeat scanner + queue manager is elegant: scan available tasks, filter by capability and dependency satisfaction, claim the highest priority match, write a checkpoint. Adding orchestration could bypass this entirely -- the orchestrator directly assigns tasks to specific agents rather than letting agents self-select from the queue, breaking the decoupled claim model.

**Why it happens:** Orchestration naturally wants to direct work: "Agent X should do Task Y because it has the right context." This feels smarter than letting agents blindly scan the queue. But it introduces tight coupling between the orchestrator and specific agent instances, which breaks when agents crash, lose context, or are unavailable.

**Prevention:**

- Orchestration should influence the queue (task priority, capability requirements, dependency ordering) rather than bypass it.
- The orchestrator places well-decomposed tasks into the queue with appropriate metadata; agents still claim via the existing `scanAndClaimTask` flow.
- If the orchestrator needs to target a specific agent, use the existing `capabilities` field as a soft routing mechanism rather than hard assignment.

**Detection:** If any orchestration code calls something other than `QueueManager.claimTask` to assign work to an agent, the queue is being bypassed.

**Phase relevance:** Phase 2 (dispatch coordination) -- the temptation to bypass the queue will be strongest here.

---

### Pitfall 8: Markdown-Based Workflow Templates Become Unparseable

**What goes wrong:** Workflow templates stored as markdown files seem human-readable and consistent with the existing project/task format. But markdown is ambiguous to parse programmatically: heading levels, list nesting, frontmatter boundaries, and freeform prose all create parsing edge cases. The existing `frontmatter.ts` already handles this carefully with `extractYamlBlock` and Zod validation, but workflow templates will need richer structure (steps, conditions, branching) that markdown headings cannot reliably encode.

**Why it happens:** Markdown is chosen for consistency with existing project/task files. But tasks are simple (flat frontmatter + prose body), while workflows are structured (ordered steps, dependencies, conditional branches, parallel groups). Forcing this structure into markdown headings and lists creates a fragile parser.

**Prevention:**

- Use YAML frontmatter for all structured workflow metadata (steps, dependencies, conditions). The prose body is for human-readable description only.
- Define a strict schema for workflow frontmatter, validated with Zod, same pattern as `TaskFrontmatterSchema`.
- Do not parse markdown body structure (heading hierarchy, list nesting) for orchestration logic -- only frontmatter.
- If workflow structure outgrows what frontmatter can express, move to a dedicated YAML or JSON file format rather than inventing a markdown DSL.

**Detection:** If the workflow parser uses regex on markdown body content (not frontmatter) to extract execution-relevant data, the format has outgrown markdown.

**Phase relevance:** Phase 1 (workflow template format) -- the format decision constrains everything downstream.

---

### Pitfall 9: Domain-Agnostic Aspiration Produces Domain-Ignorant Design

**What goes wrong:** PROJECT.md mandates "domain-agnostic from day one" -- supporting coding, research, planning, operations, and mixed workflows. In practice, this aspiration leads to such abstract workflow primitives that they are useful for nothing: verification that works for "any domain" cannot check if code compiles, research is cited, or ops changes are reversible. The system becomes a generic task tracker rather than an intelligent orchestrator.

**Why it happens:** Fear of code-only assumptions leads to removing all domain-specific intelligence. The pendulum swings from "too code-centric" to "so generic it adds no value."

**Prevention:**

- Design the core orchestration loop to be domain-agnostic (intake, decompose, dispatch, verify, recover). This is correct.
- But allow domain-specific verification strategies, decomposition heuristics, and capability definitions to be plugged in as extensions.
- Ship with one domain deeply supported (coding, since the codebase is a TypeScript project) and validate the extension points by adding a second domain (research or ops) in a later phase.
- "Domain-agnostic" means "the core does not hardcode domain assumptions," not "the system has no domain knowledge."

**Detection:** If the first end-to-end proof point works equally poorly across all domains rather than working well for one domain, the design is too generic.

**Phase relevance:** Phase 1 (architecture) and Phase 4+ (domain extensions) -- get the extension points right early, but do not try to support all domains simultaneously.

---

## Minor Pitfalls

### Pitfall 10: Checkpoint Sidecar Explosion

**What goes wrong:** The existing `CheckpointData` type records `failed_approaches`, `files_modified`, and `log` arrays that grow without bound during long-running orchestrated workflows. With orchestration adding retry and decomposition cycles, a single task might accumulate dozens of log entries and failed approaches, bloating checkpoint files and slowing checkpoint read/parse.

**Prevention:**

- Cap `failed_approaches` at 5 entries (FIFO eviction).
- Cap `log` at 50 entries with summarization of older entries.
- Add a `checkpoint_version` field so future format changes can migrate gracefully.

**Phase relevance:** Phase 3 (recovery policy) -- retry loops directly cause checkpoint bloat.

---

### Pitfall 11: File-Lock Contention Under Orchestrated Parallelism

**What goes wrong:** The existing `QueueManager` uses `withFileLock` with 3 retries and 60s stale timeout. Under orchestrated parallel execution (multiple agents claiming/releasing tasks simultaneously), lock contention increases. The current `QUEUE_LOCK_OPTIONS` (50-200ms backoff, 3 retries) may be too aggressive for high-concurrency scenarios.

**Prevention:**

- Benchmark lock contention with 4+ concurrent agents before shipping parallel dispatch.
- Consider moving to an append-only queue log with periodic compaction rather than read-modify-write on a single file.
- As a short-term measure, increase retry count to 5 and max backoff to 500ms for orchestrated workflows.

**Phase relevance:** Phase 2 (parallel dispatch) -- test under realistic concurrency before assuming the existing lock strategy scales.

---

### Pitfall 12: Subagent Registry Interaction

**What goes wrong:** The existing `subagent-registry.ts` (1,806 LOC, process-scoped singleton, known fragile area per CONCERNS.md) will need to interact with orchestration agent spawning. If the orchestrator spawns subagents that also register in the subagent registry, the existing race conditions in concurrent registration become more frequent. The registry already has no coverage for "concurrent registration of overlapping session keys."

**Prevention:**

- Do not modify `subagent-registry.ts` in early phases. Use the existing subagent spawning API as-is.
- If the orchestrator needs to track its own agent pool, keep that tracking in the orchestration layer, not in the shared registry.
- Add integration tests for concurrent subagent registration before shipping parallel orchestrated dispatch.

**Phase relevance:** Phase 2 (agent dispatch) -- the interaction with the existing registry is the highest-risk brownfield integration point.

---

## Phase-Specific Warnings

| Phase Topic                        | Likely Pitfall                                                                 | Mitigation                                                                                                       |
| ---------------------------------- | ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| Schema / workflow format (Phase 1) | Schema bloat (#1), workflow state duplication (#6), unparseable templates (#8) | Add fields incrementally, workflows are read-only during execution, structure in frontmatter only                |
| Orchestrator agent type (Phase 2)  | God agent (#2), bypassing queue (#7), decomposition quality (#4)               | Separate planning from dispatch, orchestrator influences queue not bypasses it, enforce decomposition guardrails |
| Recovery / retry (Phase 3)         | Infinite loops (#3), checkpoint bloat (#10)                                    | Hard step/token budgets enforced outside the agent, cap checkpoint arrays                                        |
| Verification (Phase 3-4)           | Overhead exceeds value (#5)                                                    | Tier by side-effect class, default to automatic, time-budget verification                                        |
| Domain support (Phase 4+)          | Domain-ignorant design (#9)                                                    | Ship one domain deep, validate extension points with second domain                                               |
| Parallel dispatch (Phase 2-3)      | File lock contention (#11), subagent registry races (#12)                      | Benchmark under concurrency, do not modify registry early                                                        |

---

## Sources

- [GitHub Blog: Multi-agent workflows often fail](https://github.blog/ai-and-ml/generative-ai/multi-agent-workflows-often-fail-heres-how-to-engineer-ones-that-dont/) -- coordination failures, state management, loose contracts (HIGH confidence)
- [Agent Patterns: Infinite Loop](https://www.agentpatterns.tech/en/failures/infinite-loop) -- loop taxonomy, detection metrics, budget enforcement (HIGH confidence)
- [Microsoft Azure: AI Agent Design Patterns](https://learn.microsoft.com/en-us/azure/architecture/ai-ml/guide/ai-agent-design-patterns) -- orchestration pattern selection, over-engineering warnings (HIGH confidence)
- [Composio: Why AI Pilots Fail](https://composio.dev/blog/why-ai-agent-pilots-fail-2026-integration-roadmap) -- production failure rates, accuracy compounding (MEDIUM confidence)
- [Continue.dev: Task Decomposition](https://blog.continue.dev/task-decomposition/) -- granularity problems, focused decomposition (MEDIUM confidence)
- [Deloitte: AI Agent Orchestration Predictions](https://www.deloitte.com/us/en/insights/industry/technology/technology-media-and-telecom-predictions/2026/ai-agent-orchestration.html) -- 40%+ cancellation rate, cost/complexity (MEDIUM confidence)
- Codebase analysis: `src/projects/schemas.ts`, `src/projects/queue-manager.ts`, `src/projects/heartbeat-scanner.ts`, `src/projects/checkpoint.ts`, `src/agents/subagent-registry.ts`, `.planning/codebase/CONCERNS.md` (HIGH confidence -- direct code inspection)

---

_Pitfalls audit: 2026-03-28_
