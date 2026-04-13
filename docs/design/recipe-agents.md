# Recipe Agents — Design Spec

**Status:** Draft  
**Author:** Roscoe (Hermes)  
**Date:** 2026-04-13  

## Overview

Recipe Agents add a third tier to Roscoebot's agent hierarchy:

| Tier | Persistence | Config Source | Use Case |
|------|------------|---------------|----------|
| **Configured Agent** | Permanent | `openclaw.json agents.list[]` | User-facing agents, always running |
| **Subagent Clone** | Ephemeral | Cloned from parent | Quick one-off subtasks |
| **Recipe Agent** ★ | Ephemeral instance, persistent card | `.md` recipe card file | Specialized task agents, spawned on demand |

Recipe cards are markdown files with YAML frontmatter that define a complete agent personality — identity, system prompt, tools, skills, model, sandbox config. Any configured agent can spawn a recipe agent by referencing its card ID. The spawned agent runs, completes the task, and the session tears down. The recipe card stays on disk for reuse.

## Motivation

- **Scale without config bloat:** 50+ specialized agents don't need 50+ entries in `openclaw.json`
- **Separation of concerns:** Recipe cards are versioned, portable, editor-friendly markdown files
- **On-demand hydration:** Agents only consume resources when spawned
- **Composability:** Any parent agent can spawn any recipe — not locked to one config tree
- **Obsidian-native:** Cards render cleanly in Obsidian/FirmVault

## Recipe Card Format

File: `~/.openclaw/recipes/{id}.md` (or workspace `recipes/` dir)

```markdown
---
id: demand-drafter
name: Demand Draft Specialist
description: Drafts demand letters from structured case files
version: 1

model: openai-codex/gpt-5.4
thinking: medium

identity:
  name: Demand Drafter
  emoji: "📝"
  theme: demand letter specialist

tools:
  profile: coding
  allow:
    - read
    - write
    - edit
    - grep
    - find
    - exec
  deny:
    - browser
    - web_search

skills:
  - demand-preparation
  - medical-records-analysis

sandbox:
  mode: all
  workspaceAccess: rw

workspace_template: demand-workspace

# Optional overrides
timeout_seconds: 300
max_children: 0          # leaf agent, cannot spawn sub-agents
cleanup: delete          # delete session when done (default)
---

# SOUL

You are the Demand Draft Specialist, a focused legal writing agent for Lawyer Incorporated.

## Core Purpose
You draft demand letters from structured case data. You receive a case file path, analyze the medical records, treatment history, and liability assessment, then produce a professional demand letter.

## Boundaries
- Never send communications externally
- Never modify source case files
- Output demand drafts to the designated output directory only
- Flag ambiguities for human review rather than guessing

## Voice
Precise, authoritative, formal legal writing. Every claim supported by specific evidence references.

---

# AGENTS

## Operating Instructions

1. Read the case file at the provided path
2. Extract: client info, accident details, medical treatment summary, damages
3. Draft demand letter following the firm's template structure
4. Save output to `{workspace}/output/demand-{caseId}.md`
5. Return a summary of what was drafted and any flagged issues

## Memory Rules
- Do not persist memory across sessions
- Each run is stateless and self-contained

## Red Lines
- Do not fabricate medical records or treatment dates
- Do not calculate damages beyond what the case file supports
```

### Card Structure

The YAML frontmatter contains all **structured configuration** — the same fields that would go in an `AgentConfig` entry in `openclaw.json`.

The markdown body contains **two named sections** parsed by heading:

| Section | Maps To | Purpose |
|---------|---------|---------|
| `# SOUL` | `SOUL.md` | Persona, boundaries, voice — the system prompt identity |
| `# AGENTS` | `AGENTS.md` | Operating instructions, memory rules, red lines |

Additional optional sections (parsed if present):

| Section | Maps To | Purpose |
|---------|---------|---------|
| `# TOOLS` | `TOOLS.md` | Tool usage guidance (not access control) |
| `# USER` | `USER.md` | Who the user/requester is |
| `# IDENTITY` | `IDENTITY.md` | Structured identity fields |

## Architecture: Virtual Agent Resolution

Recipe agents are implemented as **virtual agent configs** — synthesized on the fly from recipe card data and injected into the existing agent resolution pipeline.

### Resolution Chain (modified)

```
resolveAgentConfig(cfg, agentId)
  1. Look up agentId in cfg.agents.list[]          ← existing
  2. If not found, look up agentId in recipes dir   ← NEW
  3. If found recipe, synthesize AgentConfig from card
  4. If neither, throw "unknown agent"               ← existing
```

### Spawn Flow

```
Parent agent calls sessions_spawn:
  ┌─────────────────────────────────┐
  │ sessions_spawn({                │
  │   task: "Draft demand for...",  │
  │   recipe: "demand-drafter",    │  ← NEW parameter
  │   // or agentId: "demand-drafter" works too
  │ })                              │
  └────────────┬────────────────────┘
               │
               ▼
  ┌─────────────────────────────────┐
  │ spawnSubagentDirect()           │
  │  - resolves recipe card         │  ← NEW step
  │  - synthesizes AgentConfig      │
  │  - validates recipe permissions │
  │  - rest of spawn flow unchanged │
  └────────────┬────────────────────┘
               │
               ▼
  ┌─────────────────────────────────┐
  │ Child session created:          │
  │ agent:demand-drafter:subagent:  │
  │   {uuid}                        │
  │                                 │
  │ System prompt = recipe SOUL +   │
  │   AGENTS + subagent context     │
  │                                 │
  │ Tools/model/sandbox from recipe │
  └────────────┬────────────────────┘
               │
               ▼
  ┌─────────────────────────────────┐
  │ Agent runs task                 │
  │ Session completes               │
  │ Session torn down (cleanup)     │
  │ Recipe card untouched           │
  └─────────────────────────────────┘
```

### Session Key Format

```
agent:{recipeId}:subagent:{uuid}
```

Example: `agent:demand-drafter:subagent:a1b2c3d4-...`

The recipe ID occupies the agent ID slot, which means:
- Session utils (`isSubagentSessionKey`, `getSubagentDepth`) work unchanged
- The gateway can route follow-ups via the session key
- Subagent reactivation works if `cleanup: keep`

### System Prompt Assembly

For recipe agents, `buildAgentSystemPrompt` receives:

1. **SOUL section** from recipe card → injected where `SOUL.md` would normally be read from workspace
2. **AGENTS section** from recipe card → injected where `AGENTS.md` would normally be read from workspace  
3. **Subagent context** from `buildSubagentSystemPrompt` → appended as `extraSystemPrompt`
4. **Tools/skills/model** from recipe config → standard resolution

The existing `systemPromptOverride` field on `AgentConfig` could be used for the SOUL content, but it replaces the *entire* system prompt. Instead, recipe hydration should populate virtual workspace files that the prompt builder reads normally.

**Approach:** Create a temporary in-memory workspace overlay:
- Recipe card sections are returned by workspace file readers as if they were files on disk
- No actual temp files created — just an in-memory map passed through the prompt builder
- Falls back to physical workspace files for any section not defined in the recipe

## Config Schema Additions

### `openclaw.json` — recipes config

```json5
{
  recipes: {
    // Where recipe cards live
    dirs: [
      "~/.openclaw/recipes",       // default
      "/data/firmvault/recipes",   // additional dirs
    ],
    
    // Optional: restrict which recipes can be spawned
    allow: ["demand-drafter", "lien-analyst"],  // allowlist (omit = all)
    deny: ["experimental-*"],                    // denylist (glob patterns)
    
    // Default overrides applied to all recipes (recipe card wins)
    defaults: {
      model: "openai-codex/gpt-5.4",
      cleanup: "delete",
      sandbox: { mode: "all" },
      timeout_seconds: 300,
    },
  },
}
```

### `AgentConfig` extension — none needed

Recipe cards synthesize into `AgentConfig` objects. No schema changes to the agent config type itself. The recipes config is a new top-level key in `OpenClawConfig`.

### `sessions_spawn` tool — new parameter

```typescript
// Added to the TypeBox schema in sessions-spawn-tool.ts
recipe: Type.Optional(Type.String({
  description: "Recipe card ID to spawn. Loads agent config from the recipe card file.",
}))
```

When `recipe` is provided:
- If `agentId` is also provided, error (mutually exclusive)
- Recipe is resolved from the recipes directories
- Synthesized config is used for the spawn

## New TypeScript Types

```typescript
/** Parsed recipe card */
interface RecipeCard {
  /** Unique recipe identifier (filename stem) */
  id: string;
  /** Human-readable name */
  name?: string;
  /** What this recipe agent does */
  description?: string;
  /** Card format version */
  version?: number;
  
  // Agent config fields (same as AgentConfig subset)
  model?: AgentModelConfig;
  thinking?: string;
  identity?: AgentIdentityConfig;
  tools?: AgentToolsConfig;
  skills?: string[];
  sandbox?: AgentSandboxConfig;
  workspace_template?: string;
  
  // Recipe-specific fields
  timeout_seconds?: number;
  max_children?: number;
  cleanup?: "delete" | "keep";
  
  // Parsed markdown sections
  sections: {
    soul?: string;      // # SOUL content
    agents?: string;    // # AGENTS content  
    tools?: string;     // # TOOLS content
    user?: string;      // # USER content
    identity?: string;  // # IDENTITY content
  };
}

/** Recipes configuration in openclaw.json */
interface RecipesConfig {
  dirs?: string[];
  allow?: string[];
  deny?: string[];
  defaults?: Partial<RecipeCard>;
}
```

## File Layout

New files to create:

```
src/
  recipes/
    types.ts              # RecipeCard, RecipesConfig types
    loader.ts             # Parse .md files, resolve dirs, cache
    resolver.ts           # Synthesize AgentConfig from RecipeCard
    validator.ts          # Zod schema for recipe frontmatter
    workspace-overlay.ts  # In-memory workspace file provider
    index.ts              # Public API barrel
  
  commands/
    recipes.ts            # CLI: openclaw recipes list|show|validate|create

  agents/
    # Modified files:
    agent-scope.ts        # Add recipe fallback to resolveAgentConfig
    subagent-spawn.ts     # Handle recipe parameter in spawn flow
    system-prompt.ts      # Support workspace overlay for recipe sections
    
  agents/tools/
    sessions-spawn-tool.ts  # Add recipe parameter

  config/
    # Modified files:
    types.openclaw.ts     # Add recipes?: RecipesConfig
    zod-schema.ts         # Add recipes schema
```

## CLI Commands

```bash
# List all available recipe cards
openclaw recipes list [--json] [--dir <path>]

# Show a recipe card's parsed config
openclaw recipes show <id> [--json] [--raw]

# Validate a recipe card
openclaw recipes validate <id|path>

# Create a new recipe card from template
openclaw recipes create <id> [--template <name>]
```

## Permissions & Safety

1. **Recipe allowlist/denylist** in config controls which recipes can be spawned
2. **Parent agent's `subagents.allowAgents`** is extended to support recipe IDs (or `recipe:*` glob)
3. **Spawn depth limits** apply to recipe agents the same as regular subagents
4. **Sandbox inheritance** — if parent is sandboxed, recipe agent must be sandboxed
5. **Tool policy** — recipe's tools config is validated against global policy
6. **No external comms** — recipe agents inherit the subagent restriction on external messaging

## Recipe vs Skills vs Configured Agents

| | Recipe Card | Skill | Configured Agent |
|---|---|---|---|
| **Is an agent?** | Yes (ephemeral) | No (loaded into agent) | Yes (permanent) |
| **Has identity?** | Yes (SOUL, name, emoji) | No | Yes |
| **Has tools config?** | Yes | No | Yes |
| **Has model config?** | Yes | No (inherits) | Yes |
| **Persistence** | Card on disk | File on disk | Config entry |
| **Lifecycle** | Spawn → run → teardown | Loaded per session | Always available |
| **User-facing?** | No (task worker) | Via agent | Yes (chat) |

## Migration Path

Existing agents that are only used as subagent targets (never user-facing) can be migrated to recipe cards:
1. Export their config + workspace files to a recipe card `.md` file
2. Remove from `openclaw.json agents.list[]`
3. Update spawn calls to use `recipe: "{id}"` instead of `agentId: "{id}"`

## Open Questions

1. **Recipe inheritance** — should recipe cards be able to extend other recipe cards? (Defer to v2)
2. **Runtime recipe editing** — should there be a tool for agents to modify recipe cards? (Probably not — human-authored only)
3. **Recipe variables/parameters** — should recipe cards support template variables filled at spawn time? (e.g., `{{case_type}}` in the SOUL) (Interesting but defer to v2)
4. **Workspace templates** — the `workspace_template` field implies pre-populated workspace dirs. How are these managed? (Separate concern, can be a simple directory copy)
