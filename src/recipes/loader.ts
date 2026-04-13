import { readdir, readFile, stat } from "node:fs/promises";
import { basename, extname, join, resolve } from "node:path";

import YAML from "yaml";

import type { RecipeCard, RecipeCardSections, RecipeSectionName, RecipesConfig } from "./types.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Default directory name under the state dir. */
const DEFAULT_RECIPES_DIRNAME = "recipes";

/** Recognised section headings in recipe card bodies (case-insensitive). */
const SECTION_NAMES: readonly RecipeSectionName[] = [
  "soul",
  "agents",
  "tools",
  "user",
  "identity",
];

// ---------------------------------------------------------------------------
// Frontmatter extraction
// ---------------------------------------------------------------------------

/**
 * Extract YAML frontmatter from a markdown string.
 * Returns the parsed object and the remaining body after the closing `---`.
 */
function extractFrontmatter(raw: string): { meta: Record<string, unknown>; body: string } {
  const normalized = raw.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  if (!normalized.startsWith("---")) {
    return { meta: {}, body: normalized };
  }
  const endIndex = normalized.indexOf("\n---", 3);
  if (endIndex === -1) {
    return { meta: {}, body: normalized };
  }
  const yamlBlock = normalized.slice(4, endIndex);
  const body = normalized.slice(endIndex + 4).trimStart();
  try {
    const parsed = YAML.parse(yamlBlock, { schema: "core" });
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return { meta: parsed as Record<string, unknown>, body };
    }
  } catch {
    // Invalid YAML — treat as empty frontmatter.
  }
  return { meta: {}, body };
}

// ---------------------------------------------------------------------------
// Section splitting
// ---------------------------------------------------------------------------

/**
 * Pattern matching a top-level heading used to delimit recipe sections.
 *
 * Matches:
 *   # SOUL
 *   # AGENTS
 *   # SOUL — optional trailing text
 *
 * The heading text is captured in group 1.
 */
const HEADING_RE = /^#\s+(\S+)/;

/**
 * Split the markdown body into named sections by `# HEADING`.
 * Section content is trimmed.  Unrecognised headings are ignored (content
 * before the first recognised heading is also ignored).
 */
function splitSections(body: string): RecipeCardSections {
  const sections: RecipeCardSections = {};
  const lines = body.split("\n");
  let currentSection: RecipeSectionName | undefined;
  let buffer: string[] = [];

  function flush(): void {
    if (currentSection && buffer.length > 0) {
      const content = buffer.join("\n").trim();
      if (content) {
        sections[currentSection] = content;
      }
    }
    buffer = [];
  }

  for (const line of lines) {
    // Check for a horizontal rule separating sections (--- on its own line).
    // These act as section separators but are not themselves content.
    if (/^---\s*$/.test(line) && currentSection) {
      flush();
      currentSection = undefined;
      continue;
    }

    const headingMatch = line.match(HEADING_RE);
    if (headingMatch) {
      const name = headingMatch[1].toLowerCase() as RecipeSectionName;
      if (SECTION_NAMES.includes(name)) {
        flush();
        currentSection = name;
        continue;
      }
    }

    if (currentSection) {
      buffer.push(line);
    }
  }
  flush();

  return sections;
}

// ---------------------------------------------------------------------------
// Card parsing
// ---------------------------------------------------------------------------

/**
 * Parse a raw recipe card string into a `RecipeCard`.
 *
 * @param raw  - Raw file content (markdown with YAML frontmatter).
 * @param filePath - Absolute path to the source file (for metadata).
 */
export function parseRecipeCard(raw: string, filePath: string): RecipeCard {
  const { meta, body } = extractFrontmatter(raw);
  const sections = splitSections(body);
  const stem = basename(filePath, extname(filePath));

  return {
    // metadata
    id: typeof meta.id === "string" ? meta.id : stem,
    name: typeof meta.name === "string" ? meta.name : undefined,
    description: typeof meta.description === "string" ? meta.description : undefined,
    version: typeof meta.version === "number" ? meta.version : undefined,

    // agent config
    model: parseModelField(meta.model),
    thinking: typeof meta.thinking === "string" ? meta.thinking : undefined,
    identity: parseIdentityField(meta.identity),
    tools: parseToolsField(meta.tools),
    skills: parseStringArray(meta.skills),
    sandbox: parseSandboxField(meta.sandbox),

    // recipe-specific
    workspace_template:
      typeof meta.workspace_template === "string" ? meta.workspace_template : undefined,
    timeout_seconds:
      typeof meta.timeout_seconds === "number" ? meta.timeout_seconds : undefined,
    max_children: typeof meta.max_children === "number" ? meta.max_children : undefined,
    cleanup: meta.cleanup === "delete" || meta.cleanup === "keep" ? meta.cleanup : undefined,

    // sections
    sections,

    // source
    sourcePath: filePath,
  };
}

// ---------------------------------------------------------------------------
// Field parsers  (lenient — coerce from YAML values to typed config)
// ---------------------------------------------------------------------------

function parseModelField(value: unknown): RecipeCard["model"] {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const obj = value as Record<string, unknown>;
    if (typeof obj.primary === "string") {
      return {
        primary: obj.primary,
        fallbacks: parseStringArray(obj.fallbacks),
      };
    }
  }
  return undefined;
}

function parseIdentityField(value: unknown): RecipeCard["identity"] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const obj = value as Record<string, unknown>;
  const result: NonNullable<RecipeCard["identity"]> = {};
  if (typeof obj.name === "string") result.name = obj.name;
  if (typeof obj.emoji === "string") result.emoji = obj.emoji;
  if (typeof obj.theme === "string") result.theme = obj.theme;
  if (typeof obj.avatar === "string") result.avatar = obj.avatar;
  return Object.keys(result).length > 0 ? result : undefined;
}

function parseToolsField(value: unknown): RecipeCard["tools"] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const obj = value as Record<string, unknown>;
  const result: NonNullable<RecipeCard["tools"]> = {};
  if (typeof obj.profile === "string") result.profile = obj.profile as AgentToolsProfileId;
  if (Array.isArray(obj.allow)) result.allow = obj.allow.filter((v): v is string => typeof v === "string");
  if (Array.isArray(obj.alsoAllow))
    result.alsoAllow = obj.alsoAllow.filter((v): v is string => typeof v === "string");
  if (Array.isArray(obj.deny)) result.deny = obj.deny.filter((v): v is string => typeof v === "string");
  return Object.keys(result).length > 0 ? result : undefined;
}

// Inline type alias for the profile id — matches the string field on AgentToolsConfig.
type AgentToolsProfileId = NonNullable<NonNullable<RecipeCard["tools"]>["profile"]>;

function parseSandboxField(value: unknown): RecipeCard["sandbox"] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const obj = value as Record<string, unknown>;
  const result: Record<string, unknown> = {};
  if (typeof obj.mode === "string") result.mode = obj.mode;
  if (typeof obj.workspaceAccess === "string") result.workspaceAccess = obj.workspaceAccess;
  if (typeof obj.scope === "string") result.scope = obj.scope;
  if (typeof obj.backend === "string") result.backend = obj.backend;
  return Object.keys(result).length > 0 ? (result as NonNullable<RecipeCard["sandbox"]>) : undefined;
}

function parseStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const arr = value.filter((v): v is string => typeof v === "string");
  return arr.length > 0 ? arr : undefined;
}

// ---------------------------------------------------------------------------
// File-system loading
// ---------------------------------------------------------------------------

/** Resolve the list of recipe directories to scan. */
export function resolveRecipeDirs(
  recipesConfig: RecipesConfig | undefined,
  stateDir: string,
): string[] {
  const dirs: string[] = [];
  if (recipesConfig?.dirs && recipesConfig.dirs.length > 0) {
    for (const d of recipesConfig.dirs) {
      dirs.push(resolve(d.replace(/^~\//, `${process.env.HOME ?? "/root"}/`)));
    }
  } else {
    // Default: {stateDir}/recipes
    dirs.push(join(stateDir, DEFAULT_RECIPES_DIRNAME));
  }
  return dirs;
}

/**
 * Scan recipe directories and return all discovered recipe cards.
 * Files that fail to parse are silently skipped (logged if a logger is provided).
 */
export async function loadAllRecipes(
  recipesConfig: RecipesConfig | undefined,
  stateDir: string,
  log?: (msg: string) => void,
): Promise<RecipeCard[]> {
  const dirs = resolveRecipeDirs(recipesConfig, stateDir);
  const cards: RecipeCard[] = [];
  const seenIds = new Set<string>();

  for (const dir of dirs) {
    let entries: string[];
    try {
      entries = await readdir(dir);
    } catch {
      // Directory doesn't exist — skip silently.
      continue;
    }

    for (const entry of entries) {
      if (!entry.endsWith(".md")) continue;
      const filePath = join(dir, entry);

      try {
        const fileStat = await stat(filePath);
        if (!fileStat.isFile()) continue;
      } catch {
        continue;
      }

      try {
        const raw = await readFile(filePath, "utf-8");
        const card = parseRecipeCard(raw, filePath);
        if (seenIds.has(card.id)) {
          log?.(`[recipes] duplicate recipe id "${card.id}" in ${filePath} — skipping`);
          continue;
        }
        seenIds.add(card.id);
        cards.push(card);
      } catch (err) {
        log?.(
          `[recipes] failed to parse recipe card ${filePath}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  }

  return cards;
}

/**
 * Load a single recipe card by ID.
 * Scans configured directories and returns the first match, or `undefined`.
 */
export async function loadRecipeById(
  id: string,
  recipesConfig: RecipesConfig | undefined,
  stateDir: string,
  log?: (msg: string) => void,
): Promise<RecipeCard | undefined> {
  const dirs = resolveRecipeDirs(recipesConfig, stateDir);

  for (const dir of dirs) {
    // Try exact filename first: {id}.md
    const directPath = join(dir, `${id}.md`);
    try {
      const raw = await readFile(directPath, "utf-8");
      return parseRecipeCard(raw, directPath);
    } catch {
      // Not found at direct path — fall through to scan.
    }

    // Scan directory for a card whose frontmatter `id` field matches.
    let entries: string[];
    try {
      entries = await readdir(dir);
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (!entry.endsWith(".md")) continue;
      const filePath = join(dir, entry);
      try {
        const raw = await readFile(filePath, "utf-8");
        const card = parseRecipeCard(raw, filePath);
        if (card.id === id) return card;
      } catch {
        continue;
      }
    }
  }

  return undefined;
}

// ---------------------------------------------------------------------------
// Simple in-memory cache (keyed by file path + mtime)
// ---------------------------------------------------------------------------

type CachedRecipe = {
  card: RecipeCard;
  mtimeMs: number;
};

const cache = new Map<string, CachedRecipe>();

/**
 * Load a recipe card with caching.  Returns a cached result if the file's
 * mtime has not changed.
 */
export async function loadRecipeCached(
  id: string,
  recipesConfig: RecipesConfig | undefined,
  stateDir: string,
  log?: (msg: string) => void,
): Promise<RecipeCard | undefined> {
  // Try cache hit by id.
  for (const [, cached] of cache) {
    if (cached.card.id !== id) continue;
    try {
      const fileStat = await stat(cached.card.sourcePath);
      if (fileStat.mtimeMs === cached.mtimeMs) {
        return cached.card;
      }
    } catch {
      // File removed — evict cache entry.
      cache.delete(cached.card.sourcePath);
    }
    break;
  }

  const card = await loadRecipeById(id, recipesConfig, stateDir, log);
  if (card) {
    try {
      const fileStat = await stat(card.sourcePath);
      cache.set(card.sourcePath, { card, mtimeMs: fileStat.mtimeMs });
    } catch {
      // Stat failed — still return the card, just don't cache.
    }
  }
  return card;
}

/** Clear the recipe cache (useful for tests). */
export function clearRecipeCache(): void {
  cache.clear();
}
