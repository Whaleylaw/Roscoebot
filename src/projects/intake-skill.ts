/**
 * Static intake skill content for the user's agent.
 *
 * Per D-08: shipped as part of the repo/package, always present after install.
 * Per D-09: no dedicated CLI command -- any agent recognizes work descriptions naturally.
 * Per D-10: the user's own agent runs intake, not the orchestrator.
 *
 * The skill guides conversational clarification from natural language goals to
 * structured IntakePayload JSON for handoff to the orchestrator via sessions_send.
 */

export const INTAKE_SKILL_MD = `# Intake Skill

Guide users from natural language goals to structured orchestration payloads.

## When to Activate

Activate this skill when the user describes work to be done, a goal to accomplish, or a task to perform. There is no dedicated CLI command -- recognize work descriptions naturally from conversation (D-09).

Unless the input is unambiguous and clearly a single action, reflect your interpretation back to the user and get confirmation before proceeding (D-02).

Examples of triggering inputs:
- "Set up a CI pipeline for the backend"
- "I need to migrate our database to PostgreSQL"
- "Research alternatives to our current auth provider"
- "Build a notification system"

## Clarification Flow

Determine four things through conversation (D-11):

### Step 1: Understand the Request

- Reflect your interpretation of what the user wants back to them
- Ask clarifying questions if the scope, approach, or success criteria are unclear
- Do not assume -- get confirmation before creating anything (D-02)
- If the request is already clear and specific, move to the next step

### Step 2: Determine Artifact Type (D-03)

Choose the right artifact type for the scope of work:

- **task** -- Simple single action (e.g., "fix this bug", "update the README")
- **workflow** -- Multi-step structured work (e.g., "add auth to the API", "set up CI/CD")
- **project** -- Large initiative with multiple workstreams (e.g., "rewrite the frontend", "build a new product")

When in doubt, default to **workflow**. Most meaningful work is multi-step.

### Step 3: Determine Project Placement (D-04, D-05, D-06, D-07)

Decide where the work belongs:

1. Read active project summaries using \`readProjectSummaries\` and format them with \`formatProjectsForPlacement\`
2. Use your reasoning to assess whether the request fits within an existing project
3. **Always propose placement and ask the user** -- never auto-place (D-05)
4. Only suggest sub-project creation when the user explicitly requests it (D-06)
5. The user can override any placement suggestion (D-07, PPL-03)

Present your recommendation like:
> "This looks like it belongs in the **backend-api** project. Should I place it there, or would you prefer a new project?"

If the user provides a placementOverride, honor it.

### Step 4: Match or Synthesize Template (D-12, D-13)

Find or create the right workflow structure:

1. List available templates using \`listAllTemplates\`
2. Present matching template suggestions with name and description
3. If a template matches:
   - Collect the template's required parameters from the user
   - Set \`templateName\` in the payload
4. If no template matches:
   - Mark for synthesis by setting \`synthesize: true\` (SYN-01)
   - The orchestrator will generate a workflow from scratch (D-20)

## Handoff Format

When clarification is complete, produce a JSON payload and send it to the orchestrator via \`sessions_send\`:

\`\`\`json
{
  "type": "orchestrate",
  "goal": "<full goal description from the user>",
  "goalTitle": "<short title, 5-10 words>",
  "project": "<project name>",
  "projectDir": "<absolute path to project directory>",
  "templateName": "<matched template name, omit if synthesizing>",
  "templateParams": {
    "<param_name>": "<value collected during clarification>"
  },
  "synthesize": false,
  "artifactType": "task|workflow|project",
  "placementOverride": {
    "action": "existing|new",
    "projectName": "<override project name>",
    "projectDir": "<override project dir>"
  },
  "constraints": {
    "maxTasks": 10,
    "sideEffectPolicy": "ask-irreversible"
  }
}
\`\`\`

### Field Reference

| Field | Required | Description |
|-------|----------|-------------|
| type | Yes | Always "orchestrate" |
| goal | Yes | Full natural language goal description |
| goalTitle | Yes | Short title for display (5-10 words) |
| project | Yes | Target project name |
| projectDir | Yes | Absolute path to target project directory |
| templateName | No | Name of matched template (omit if synthesizing) |
| templateParams | No | Parameter values for the matched template |
| synthesize | No | Set to true when no template matches (SYN-01) |
| artifactType | No | "task", "workflow", or "project" (default: workflow) |
| placementOverride | No | User override for project placement (PPL-03) |
| constraints | No | Execution constraints (maxTasks, sideEffectPolicy) |

This payload conforms to the IntakePayload type defined in \`intake-payload.ts\`.

## Guidelines

- The user's agent runs intake, not the orchestrator (D-08, D-10)
- "goal" is the user's natural language input, not a system entity (D-01)
- Synthesized workflows follow the same format as templates (D-16, D-21)
- After a synthesized workflow succeeds, offer to save it as a reusable template (D-22)
- Keep clarification conversational and concise -- do not interrogate
- When the user provides constraints, include them in the payload
- If the user changes their mind during clarification, update the payload accordingly
`;

/**
 * Returns the intake skill content as a string.
 * Convenience accessor for dynamic contexts where a function call is preferred.
 */
export function getIntakeSkillContent(): string {
  return INTAKE_SKILL_MD;
}
