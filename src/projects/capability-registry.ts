/**
 * Standard starter capability tags (per D-16).
 * Each project defines its own set; these are documented recommendations.
 */
export const STANDARD_CAPABILITIES = ["code", "research", "ops", "review", "deploy"] as const;

export type StandardCapability = (typeof STANDARD_CAPABILITIES)[number];

/**
 * Validate that all capability tags on a task are registered in the project's
 * allowed_capabilities list (per D-14, D-15).
 *
 * Rules:
 * - Empty allowedCaps (default []) = no restriction (backward compatible with existing projects)
 * - Empty taskCaps = always valid (task has no capability requirements)
 * - Otherwise, every task capability must appear in allowedCaps
 *
 * @param taskCaps - capabilities array from task frontmatter
 * @param allowedCaps - allowed_capabilities array from project frontmatter
 * @returns { valid: boolean, unregistered: string[] }
 */
export function validateCapabilities(
  taskCaps: string[],
  allowedCaps: string[],
): { valid: boolean; unregistered: string[] } {
  if (allowedCaps.length === 0 || taskCaps.length === 0) {
    return { valid: true, unregistered: [] };
  }
  const allowed = new Set(allowedCaps);
  const unregistered = taskCaps.filter((cap) => !allowed.has(cap));
  return { valid: unregistered.length === 0, unregistered };
}
