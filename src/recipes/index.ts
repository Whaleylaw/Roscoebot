// Recipes — ephemeral specialized agents hydrated from recipe card files.
//
// Public API:
//   Types:        RecipeCard, RecipesConfig, RecipeCardSections, …
//   Loader:       parseRecipeCard, loadRecipeById, loadAllRecipes, loadRecipeCached
//   Resolver:     synthesizeAgentConfig, createRecipeOverlay, WorkspaceOverlay
//   Validator:    validateRecipeCard, isRecipeAllowed

export type {
  RecipeCard,
  RecipeCardSections,
  RecipeDefaultsConfig,
  RecipeSectionName,
  RecipesConfig,
} from "./types.js";

export {
  clearRecipeCache,
  loadAllRecipes,
  loadRecipeById,
  loadRecipeCached,
  parseRecipeCard,
  resolveRecipeDirs,
} from "./loader.js";

export {
  createRecipeOverlay,
  synthesizeAgentConfig,
} from "./resolver.js";

export type { WorkspaceOverlay } from "./resolver.js";

export {
  isRecipeAllowed,
  RecipeFrontmatterSchema,
  validateRecipeCard,
} from "./validator.js";

export type {
  RecipeValidationIssue,
  RecipeValidationResult,
} from "./validator.js";
