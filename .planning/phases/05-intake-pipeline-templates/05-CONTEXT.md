# Phase 5: Intake Pipeline & Templates - Context

**Gathered:** 2026-03-29
**Status:** Ready for planning

<domain>
## Phase Boundary

Users describe what they want done in natural language and the system — through a conversational clarification flow — determines the right artifact (task, workflow, or project), places it correctly, selects or generates an appropriate workflow when needed, and kicks off orchestration. This phase delivers the intake skill (conversational flow any agent can follow), project placement logic, workflow template system (bundled + user-created with three-tier lookup), workflow synthesis from natural language, and the template-to-reusable-template save flow. It does NOT deliver progress observability (Phase 6).

</domain>

<decisions>
## Implementation Decisions

### Core Philosophy: Goal Is Just User Input

- **D-01:** "Goal" is NOT a system entity. It's simply the user's natural language input. The system's job is to interpret that input through a clarification loop and produce the right artifact — a task, a workflow, or a project.
- **D-02:** Don't assume, clarify. Unless the input is unambiguous and clearly a single action, the agent reflects back its interpretation and gets confirmation before creating anything. This mirrors the discuss-phase pattern: gather context through conversation before committing to structure.
- **D-03:** Output can be any artifact. A simple request becomes a single task. A bigger request becomes a workflow. A large initiative might warrant a new project. The intake logic determines which, with user confirmation.

### Project Placement

- **D-04:** LLM-driven placement. The agent reads PROJECT.md summaries from active projects and uses LLM reasoning to assess whether the user's request belongs in an existing project. No keyword heuristics or algorithmic matching.
- **D-05:** User drives project decisions. If the agent thinks something belongs in a project, it proposes and asks — it never auto-places. Users are generally explicit about projects when their request is project-related.
- **D-06:** User decides sub-project explicitly. The system always suggests either an existing project or a new project. Sub-project creation only happens when the user explicitly requests it. No automatic sub-project heuristics.
- **D-07:** User can override any placement per PPL-03. The agent's proposal is always a suggestion, never a final decision without confirmation.

### Intake Flow

- **D-08:** The user's agent runs intake, not the orchestrator. Whatever agent the user is chatting with handles the clarification conversation, then hands off structured work to the orchestrator. The orchestrator never talks to the user directly — it receives pre-clarified input.
- **D-09:** Natural conversation trigger only. No dedicated CLI command for intake. Any agent recognizes when the user is describing work and enters the intake flow. Consistent with "goal is just user input" — the system meets the user where they are.
- **D-10:** Intake skill guides the flow. An intake skill (markdown instruction set) defines the conversational process any agent follows. This is the reusable instruction set — not hardcoded logic in a specific agent.
- **D-11:** Intake determines four things before handoff: (1) what artifact to create (task, workflow, or project), (2) which project it belongs to (if applicable), (3) which template fits (if any), (4) key parameters for the template or synthesis.

### Workflow Templates

- **D-12:** Templates span a spectrum from rigid/procedural (fixed steps, variables are project context — e.g., medical records request) to structural/flexible (defines sections and flow, agent fills specifics — e.g., research template). The system accommodates both.
- **D-13:** Three-tier template lookup: project-local (`{project}/templates/`) first, then global (`~/.openclaw/templates/`), then bundled (shipped with package). Project-local templates take precedence.
- **D-14:** Bundled default templates ship with the package covering at least three work types per TPL-02 (code feature, research report, ops runbook). Users can create additional templates.
- **D-15:** Template creation is a conversational process. Users work with the agent to create new templates through a dedicated template creation skill/workflow. The agent guides them through defining the template structure, parameters, skills, and tool references.
- **D-16:** Synthesized workflows follow the same structure as templates (frontmatter with params, steps with owners, skill/tool references if applicable). Consistent format regardless of whether the workflow came from a template or was generated.

### Workflow Template Structure

- **D-17:** Workflow templates reference skills, tools, and document templates. A workflow template like "send medical records request" references a skill that defines how to execute, which in turn references letter templates and tools. This layered pattern (workflow → skills → templates/tools) must be supported.
- **D-18:** Template parameterization varies by template type. Workflow templates use frontmatter params for structured parameters (provider, client, project context). Document/artifact templates within skills may use placeholder tokens in the body for programmatic replacement. Both patterns coexist.
- **D-19:** Templates support rich domain-specific metadata: triggers (what activates the workflow), per-item execution (repeat for each item in a list), prerequisites (conditions that must be met), related skills and tools references.

### Workflow Synthesis

- **D-20:** When no template matches, the orchestrator generates a workflow from scratch based on the clarified user input. The synthesized workflow is written to disk as a WF-NNN.md file before execution begins (SYN-03).
- **D-21:** Synthesized workflows match template format — same frontmatter structure, step format, and optional skill/tool references. No reduced-fidelity "lite" format.
- **D-22:** Save as template after success. After a synthesized workflow completes successfully, the agent can offer to save it as a reusable template. User confirms, agent strips project-specific values and creates a template in the appropriate location (project-local or global).

### Claude's Discretion

- Intake skill content and conversational prompts (how the agent guides clarification)
- Template creation skill/workflow design
- Bundled template content beyond the three required types
- LLM prompt engineering for project placement scoring and workflow synthesis
- Internal implementation of three-tier template lookup
- How the agent determines when user input is "unambiguous enough" to skip clarification

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Existing Orchestration System (extend this)

- `src/projects/orchestrator.ts` — orchestrateGoal() pipeline, DecomposedTask type, validateTaskGraph(). Intake feeds into this.
- `src/projects/scaffold.ts` — ProjectManager with create(), createSubProject(), nextWorkflowId(), ensureWorkflowsDir(). Used for project/workflow creation during intake.
- `src/projects/templates.ts` — generateWorkflowMd(), generateProjectMd(), generateTaskMd(). Template generation patterns.
- `src/projects/schemas.ts` — WorkflowFrontmatterSchema with template field (D-04 from Phase 1). Extend for template params.
- `src/projects/capability-registry.ts` — validateCapabilities(), STANDARD_CAPABILITIES. Used during template matching.

### Existing Workflow System (design reference for domain-specific workflows)

- `~/.openclaw/workspace-paralegal/FirmVault/skills.tools.workflows/workflows/README.md` — Architecture overview of existing passive workflow system with phases, landmarks, skills, tools, templates
- `~/.openclaw/workspace-paralegal/FirmVault/skills.tools.workflows/workflows/phase_2_treatment/workflows/request_records_bills/workflow.md` — Real workflow example: frontmatter with related_skills, related_tools, templates, triggered_by, per_item, repeatable. Primary reference for rich workflow template structure.
- `~/.openclaw/workspace-paralegal/FirmVault/skills.tools.workflows/workflows/skills/` — Skill definitions that workflows reference (medical, demand, discovery, etc.)
- `~/.openclaw/workspace-paralegal/FirmVault/skills.tools.workflows/workflows/templates/` — Document templates (letters, forms) referenced by skills

### Agent System

- `src/agents/project-context-hook.ts` — Project context injection at session start. Intake skill would use this pattern.
- `src/agents/workspace.ts` — Agent workspace resolution. Skills/templates may live in workspaces.

### Prior Phase Context

- `.planning/phases/01-schema-workflow-foundation/01-CONTEXT.md` — Workflow file format, template field in frontmatter (D-04), lifecycle states
- `.planning/phases/02-orchestrator-decomposition-queue-integration/02-CONTEXT.md` — Orchestrator receives structured payload via sessions_send (D-09), LLM-driven decomposition (D-01), clarification loop (D-03/D-04)
- `.planning/phases/04-recovery-resumability/04-CONTEXT.md` — notifyUser stub to wire to sessions_send in Phase 5 (noted in D-05)

### Requirements

- `.planning/REQUIREMENTS.md` — PPL-01 through PPL-03, TPL-01 through TPL-03, SYN-01 through SYN-03

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

- `orchestrateGoal()` in `orchestrator.ts` — Existing pipeline that validates, creates workflow, batch-creates tasks, activates. Intake produces input for this.
- `ProjectManager` in `scaffold.ts` — create(), createSubProject(), nextWorkflowId(), ensureWorkflowsDir(). All project/workflow creation primitives exist.
- `generateWorkflowMd()` in `templates.ts` — Generates WF-NNN.md with frontmatter. Extend for template-sourced generation.
- `parseWorkflowFrontmatter()` in `frontmatter.ts` — Validates workflow files. Reuse for template validation.
- Existing paralegal workflow system — Rich real-world example of phases, workflows, skills, tools, templates pattern. Reference for template structure design.

### Established Patterns

- Orchestrator workspace files ship as static templates with the package (Phase 2 D-08)
- sessions_send for structured inter-agent communication
- YAML frontmatter + markdown body for all project artifacts
- Skill files (skill.md) define execution instructions; workflows reference them
- Three-tier resolution patterns exist elsewhere in the system (config precedence, plugin resolution)

### Integration Points

- `orchestrateGoal()` — Intake produces the structured input this function expects
- Agent AGENTS.md / skills — Intake skill needs to be discoverable by any agent
- `src/projects/schemas.ts` — May need template-specific schema extensions for params, triggers, per-item
- Template directories — New directories at project-local, global, and bundled levels
- `src/projects/index.ts` — Export new intake/template symbols

</code_context>

<specifics>
## Specific Ideas

- The first real use case is Whaley Law Firm as a project, with each case as a sub-project. Existing paralegal workflows (phases 0-8 with landmarks, skills, tools, letter templates) will be converted into this system. The template system must accommodate this rich domain-specific workflow pattern while also supporting simpler ad-hoc workflows.
- The workflow → skill → template/tool layering is the core pattern from the existing paralegal system. A workflow like "send medical records request" references a skill (medical-records-request/skill.md) which references letter templates (Word docs) and tools (Python scripts). This layered composition must be supported in the template system.
- The intake skill pattern — any agent can follow the same conversational intake instructions — is consistent with how GSD's discuss-phase works. The skill is the shared protocol, not a hardcoded behavior in one agent.
- Phase 4 noted: "notifyUser injectable stub with log-only default; wire to sessions_send in Phase 5." This should be addressed as part of intake integration.

</specifics>

<deferred>
## Deferred Ideas

- **Template versioning** — Templates could have versions for tracking changes over time. Deferred per REQUIREMENTS.md out-of-scope (workflow versioning/branching).
- **Template marketplace/sharing** — Users could share templates between workspaces or publish them. Future capability, not Phase 5 scope.
- **Automated template suggestion** — System proactively suggests "this looks like a pattern, want to save as a template?" before workflow completion. Phase 5 delivers explicit save-as-template only.

</deferred>

---

*Phase: 05-intake-pipeline-templates*
*Context gathered: 2026-03-29*
