# Phase 5: Intake Pipeline & Templates - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-03-29
**Phase:** 05-intake-pipeline-templates
**Areas discussed:** Project placement, Template design, Workflow synthesis, Intake entry point

---

## Project Placement

### What is a "goal"?

**User clarification (not a menu choice):** The user raised that "goal" was undefined in the system. Through discussion, established that "goal" is NOT a system entity — it's just user input. Any input can become a task, workflow, or project. Users are generally explicit about projects. When ambiguous, the agent must ask clarifying questions and confirm interpretation before acting.

**Key quote:** "If a user is giving goal information on what they want done, the agent needs to ask clarifying questions so that they can better create the project or the workflow or task or whatever it is. Because what they shouldn't do is make assumptions."

### How should the system match a goal to an existing project?

| Option | Description | Selected |
|--------|-------------|----------|
| LLM-driven matching | Orchestrator reads PROJECT.md summaries, uses LLM reasoning to score relevance | ✓ |
| Keyword heuristic matching | Extract keywords, match against project names/descriptions/capabilities | |
| Hybrid: keyword shortlist + LLM pick | Keywords narrow to candidates, LLM picks best match | |

**User's choice:** LLM-driven matching
**Notes:** Consistent with Phase 2's LLM-driven decomposition approach.

### When should a goal become a sub-project vs a new top-level project?

| Option | Description | Selected |
|--------|-------------|----------|
| User decides explicitly | System suggests project (existing or new), user can override to sub-project | ✓ |
| Scope-based heuristic | Auto-suggest sub-project if goal is subset of existing project | |
| You decide | Claude's discretion | |

**User's choice:** User decides explicitly
**Notes:** No automatic sub-project creation.

---

## Template Design

### Where should workflow templates live?

**User's choice (free text):** All locations — bundled with package, user-created globally, and project-local. Users can create templates by working with the agent through a conversational template creation process. Suggested a "template creation skill or workflow."

### How opinionated should templates be?

**User's choice (free text):** Varies by template. Medical records request = rigid/procedural (fixed steps, only variables are project context). Research template = structural/flexible (defines flow, agent fills specifics). Both ends of the spectrum must be supported.

**Key example:** "Send medical records request" workflow has a fixed template. To execute, it uses another template — a letter template (Word doc). Workflow templates and document templates are different layers.

### Template parameterization

**User's choice (free text):** Varies by template type. Workflow templates use frontmatter params. Document/letter templates use placeholder tokens in body for programmatic replacement. Both patterns coexist.

### Where should user-created templates be stored?

| Option | Description | Selected |
|--------|-------------|----------|
| Per-project templates/ dir | Scoped to project, fallback to global | |
| Global ~/.openclaw/templates/ | One directory, all projects | |
| Both: project-local + global | Three-tier: project → global → bundled | ✓ |

**User's choice:** Both: project-local + global

### Existing workflow system reference

**User direction:** Pointed to `~/.openclaw/workspace-paralegal/FirmVault/skills.tools.workflows/workflows/` as the real-world reference. This system has phases with landmarks, workflows with skills and tools, letter templates. The new system must accommodate this pattern but also support simpler ad-hoc workflows.

---

## Workflow Synthesis

### How much structure should the agent impose when synthesizing?

| Option | Description | Selected |
|--------|-------------|----------|
| Match template format | Same structure as templates: frontmatter, steps, skill/tool refs | ✓ |
| Minimal viable structure | Just valid WF-NNN.md frontmatter + task list | |
| You decide | Claude's discretion | |

**User's choice:** Match template format
**Notes:** Consistent format regardless of source.

### Should synthesized workflows be saveable as templates?

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, explicit save | Agent offers to save after successful completion, user confirms | ✓ |
| Yes, automatic suggestion | System auto-suggests saving on completion | |
| No, keep separate | Templates created through dedicated flow only | |

**User's choice:** Yes, explicit save

---

## Intake Entry Point

### Who runs the intake conversation?

| Option | Description | Selected |
|--------|-------------|----------|
| The user's agent | Agent handles clarification, hands off structured work to orchestrator | ✓ |
| The orchestrator directly | Orchestrator conducts clarification via sessions_send | |
| Either, depending on context | User's agent for chat, orchestrator for automation | |

**User's choice:** The user's agent
**Notes:** Orchestrator never talks to user directly.

### Should intake be a CLI command, natural trigger, or both?

| Option | Description | Selected |
|--------|-------------|----------|
| Natural conversation only | Any agent recognizes work description, enters intake flow | ✓ |
| Both CLI + natural | CLI shortcut plus natural detection | |
| CLI command only | Explicit command required | |

**User's choice:** Natural conversation only

### What does the agent determine during intake?

| Option | Description | Selected |
|--------|-------------|----------|
| What artifact to create | Task, workflow, or project — via clarification | ✓ |
| Which project it belongs to | Existing or new project, agent proposes, user confirms | ✓ |
| Which template fits | Check templates, propose if relevant | ✓ |
| Key parameters | Gather required params for template or synthesis | ✓ |

**User's choice:** All four selected
**Notes:** User added: "We should create an intake skill for the agent to follow."

---

## Claude's Discretion

- Intake skill content and conversational prompts
- Template creation skill/workflow design
- Bundled template content beyond three required types
- LLM prompt engineering for placement and synthesis
- Three-tier template lookup implementation
- Ambiguity threshold for skipping clarification

## Deferred Ideas

- Template versioning — out of scope per REQUIREMENTS.md
- Template marketplace/sharing — future capability
- Automated template suggestion before workflow completion — Phase 5 delivers explicit save only
