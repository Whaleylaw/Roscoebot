# Recipe Agents — Implementation Plan

**Depends on:** `recipe-agents.md` (design spec)

## Phase 1: Foundation (Recipe Loader + Types)

### 1.1 Recipe Card Types
**File:** `src/recipes/types.ts`

Define `RecipeCard`, `RecipesConfig`, `RecipeSection` interfaces. Keep them
independent of `AgentConfig` — the resolver bridges between them.

### 1.2 Recipe Card Parser  
**File:** `src/recipes/loader.ts`

- Parse `.md` files: extract YAML frontmatter via `gray-matter` (already a dependency)
- Split markdown body by `# HEADING` into named sections
- Resolve recipe dirs from config (default `~/.openclaw/recipes/`)
- Cache parsed cards (invalidate on file mtime change)
- Export: `loadRecipe(id, config)`, `listRecipes(config)`, `resolveRecipePath(id, config)`

### 1.3 Recipe Validator
**File:** `src/recipes/validator.ts`

- Zod schema for recipe frontmatter fields
- Validate tools/skills references exist
- Validate model string format
- Export: `validateRecipeCard(card): ValidationResult`

### 1.4 Tests
- Parser handles frontmatter + markdown sections correctly
- Missing sections return undefined (not error)
- Malformed YAML errors are clear
- File glob/directory scanning works
- Cache invalidation on mtime change

---

## Phase 2: Config Integration

### 2.1 OpenClawConfig Extension
**File:** `src/config/types.openclaw.ts` — add `recipes?: RecipesConfig`  
**File:** `src/config/zod-schema.ts` — add recipes schema validation

### 2.2 Recipe Resolver
**File:** `src/recipes/resolver.ts`

Synthesize `AgentConfig` from `RecipeCard`:

```typescript
function synthesizeAgentConfig(
  recipe: RecipeCard,
  recipesConfig: RecipesConfig,
): AgentConfig {
  return {
    id: recipe.id,
    name: recipe.name,
    model: recipe.model ?? recipesConfig.defaults?.model,
    thinkingDefault: recipe.thinking ?? recipesConfig.defaults?.thinking,
    identity: recipe.identity,
    tools: recipe.tools ?? recipesConfig.defaults?.tools,
    skills: recipe.skills,
    sandbox: recipe.sandbox ?? recipesConfig.defaults?.sandbox,
    // workspace is handled by overlay, not a physical dir
    // subagents config: max_children from recipe
    subagents: recipe.max_children !== undefined
      ? { maxChildrenPerAgent: recipe.max_children }
      : undefined,
  };
}
```

### 2.3 Agent Scope Fallback
**File:** `src/agents/agent-scope.ts` — modify `resolveAgentConfig`

Add recipe fallback after agents.list[] lookup:

```typescript
export function resolveAgentConfig(
  cfg: OpenClawConfig,
  agentId: string,
): AgentConfig | undefined {
  // Existing: look up in agents.list[]
  const fromList = cfg.agents?.list?.find(a => normalize(a.id) === normalize(agentId));
  if (fromList) return fromList;
  
  // NEW: check recipes
  const recipe = loadRecipeCached(agentId, cfg.recipes);
  if (recipe) return synthesizeAgentConfig(recipe, cfg.recipes ?? {});
  
  return undefined;
}
```

### 2.4 Tests
- Configured agent takes priority over recipe with same ID
- Recipe fallback returns synthesized config
- Missing recipe returns undefined (not error)
- Recipe defaults merge correctly

---

## Phase 3: Spawn Integration

### 3.1 Workspace Overlay
**File:** `src/recipes/workspace-overlay.ts`

In-memory workspace file provider that intercepts workspace file reads:

```typescript
interface WorkspaceOverlay {
  /** Returns content for a workspace file, or undefined to fall through to disk */
  readFile(filename: string): string | undefined;
  /** List of files this overlay provides */
  files(): string[];
}

function createRecipeOverlay(recipe: RecipeCard): WorkspaceOverlay {
  const map = new Map<string, string>();
  if (recipe.sections.soul) map.set("SOUL.md", recipe.sections.soul);
  if (recipe.sections.agents) map.set("AGENTS.md", recipe.sections.agents);
  if (recipe.sections.tools) map.set("TOOLS.md", recipe.sections.tools);
  if (recipe.sections.user) map.set("USER.md", recipe.sections.user);
  if (recipe.sections.identity) map.set("IDENTITY.md", recipe.sections.identity);
  return {
    readFile: (f) => map.get(f),
    files: () => [...map.keys()],
  };
}
```

### 3.2 System Prompt Builder
**File:** `src/agents/system-prompt.ts` — modify workspace file reading

The prompt builder currently reads SOUL.md, AGENTS.md, etc. from the workspace directory. Add an optional `overlay` parameter:

```typescript
async function buildAgentSystemPrompt(opts: {
  // ... existing params
  workspaceOverlay?: WorkspaceOverlay;  // NEW
}): Promise<string> {
  // When reading workspace files:
  const soulContent = opts.workspaceOverlay?.readFile("SOUL.md")
    ?? await readWorkspaceFile(workspaceDir, "SOUL.md");
  // ... same pattern for AGENTS.md, TOOLS.md, etc.
}
```

### 3.3 Spawn Tool Extension
**File:** `src/agents/tools/sessions-spawn-tool.ts`

Add `recipe` parameter to the TypeBox schema:

```typescript
recipe: Type.Optional(Type.String({
  description: "Recipe card ID. Spawns a specialized agent from the recipe card definition.",
}))
```

Validation: `recipe` and `agentId` are mutually exclusive.

### 3.4 Spawn Flow Modification
**File:** `src/agents/subagent-spawn.ts` — modify `spawnSubagentDirect`

Insert recipe resolution early in the spawn flow:

```typescript
async function spawnSubagentDirect(opts: SpawnOpts) {
  // ... existing validation
  
  let recipeCard: RecipeCard | undefined;
  let effectiveAgentId = opts.agentId;
  
  // NEW: resolve recipe
  if (opts.recipe) {
    recipeCard = loadRecipe(opts.recipe, config.recipes);
    if (!recipeCard) throw new Error(`Recipe not found: ${opts.recipe}`);
    
    // Check recipe allowlist/denylist
    validateRecipePermissions(opts.recipe, config.recipes);
    
    // Recipe ID becomes the effective agent ID
    effectiveAgentId = recipeCard.id;
  }
  
  // ... existing spawn depth / children checks
  // ... generate child session key using effectiveAgentId
  
  // When building system prompt, pass the workspace overlay
  const overlay = recipeCard ? createRecipeOverlay(recipeCard) : undefined;
  
  // ... rest of spawn flow, passing overlay through to prompt builder
}
```

### 3.5 Tests
- Spawn with `recipe: "demand-drafter"` creates correct session key
- Recipe SOUL/AGENTS content appears in system prompt
- Recipe tools/model/sandbox config is applied
- `recipe` + `agentId` together produces error
- Unknown recipe produces clear error
- Recipe denylist blocks spawn
- Spawn depth limits still enforced

---

## Phase 4: CLI

### 4.1 Recipe Commands
**File:** `src/commands/recipes.ts`

```bash
openclaw recipes list [--json] [--dir <path>]
  # Lists all recipe cards with id, name, description

openclaw recipes show <id> [--json] [--raw]
  # Shows parsed recipe config + sections preview

openclaw recipes validate <id|path>
  # Validates frontmatter schema, tool refs, model format

openclaw recipes create <id> [--template <starter>]
  # Creates a new recipe card from template
```

### 4.2 CLI Registration
**File:** `src/cli/program/register.recipes.ts` — new  
**File:** `src/cli/program/register.ts` — add recipes registration

---

## Phase 5: Polish & Integration

### 5.1 Recipe Discovery in Subagent Prompt
When a parent agent has recipe access, include available recipes in the subagent spawning guidance section of the system prompt:

```
## Available Recipes
You can spawn specialized agents from these recipe cards:
- demand-drafter: Drafts demand letters from case files
- lien-analyst: Analyzes and resolves medical liens
- records-reviewer: Reviews medical records for completeness
Use sessions_spawn with recipe="<id>" and a task description.
```

### 5.2 Gateway Events
Emit recipe-specific events:
- `recipe.spawned` — when a recipe agent is instantiated
- `recipe.completed` — when a recipe agent finishes

### 5.3 Observability
- Tag Langfuse traces with `recipe:{id}` for recipe agent runs
- Include recipe ID in session metadata

### 5.4 Migration Tool
```bash
openclaw recipes migrate --agent <id>
  # Exports a configured agent to a recipe card
  # Reads agent config + workspace files, outputs .md file
```

---

## Dependency Map

```
Phase 1 (Foundation)
  └── Phase 2 (Config Integration)
        └── Phase 3 (Spawn Integration)  ← core value delivered here
              └── Phase 4 (CLI)
              └── Phase 5 (Polish)
```

Phases 4 and 5 are independent of each other.

## Risk Assessment

| Risk | Mitigation |
|------|-----------|
| Recipe ID collides with configured agent ID | Configured agents always take priority; warn on collision |
| Recipe card parsing is fragile (markdown heading parsing) | Strict section detection: `^# SOUL$`, `^# AGENTS$` etc. on own line |
| Performance: reading recipe files on every spawn | Cache with mtime invalidation |
| Workspace overlay adds complexity to prompt builder | Single optional parameter, clean fallback |
| Security: recipe card references unsafe tools | Recipe tools validated against global policy + parent permissions |
