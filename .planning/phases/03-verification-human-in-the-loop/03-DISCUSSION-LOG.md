# Phase 3: Verification & Human-in-the-Loop - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-03-29
**Phase:** 03-verification-human-in-the-loop
**Areas discussed:** Verification execution model, Human approval flow, Task completion gating, Mixed verification orchestration

---

## Verification Execution Model

### Q1: How should automatic verification checks run?

| Option                           | Description                                                                                                                                       | Selected |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| Hook-driven inline               | "project:task-verify" hook fires after task-complete. Verification reads success_criteria and runs checks inline. Evidence in checkpoint sidecar. | ✓        |
| Orchestrator-polled on heartbeat | Orchestrator checks verification on next heartbeat (~30min). Simpler but introduces latency.                                                      |          |
| Separate verifier agent          | Dedicated verification agent claims tasks in "review" status. More isolated but adds coordination.                                                |          |

**User's choice:** Hook-driven inline (Recommended)
**Notes:** None

### Q2: What types of automatic verification checks?

| Option                   | Description                                           | Selected |
| ------------------------ | ----------------------------------------------------- | -------- |
| File existence checks    | Verify expected output files exist at specified paths | ✓        |
| Command execution checks | Run shell command, check exit code / output pattern   | ✓        |
| Content pattern checks   | Grep/regex against file contents                      |          |
| You decide               | Claude picks based on success_criteria                |          |

**User's choice:** File existence checks + Command execution checks
**Notes:** Multi-select — two check types chosen

### Q3: Where to store verification evidence?

| Option                     | Description                                                | Selected |
| -------------------------- | ---------------------------------------------------------- | -------- |
| Checkpoint sidecar         | Extend .TASK-NNN.checkpoint.json with verification section | ✓        |
| Separate verification file | .TASK-NNN.verification.json alongside checkpoint           |          |
| Task frontmatter           | Record in YAML frontmatter                                 |          |

**User's choice:** Checkpoint sidecar (Recommended)
**Notes:** None

### Q4: How should success criteria be expressed?

| Option                      | Description                                                    | Selected |
| --------------------------- | -------------------------------------------------------------- | -------- |
| Structured YAML list        | success_criteria as array of objects with type/path/cmd/expect | ✓        |
| Free-text with conventions  | Natural language with pattern matching                         |          |
| Both — structured preferred | Structured primary, free-text fallback                         |          |

**User's choice:** Structured YAML list (Recommended)
**Notes:** None

---

## Human Approval Flow

### Q1: How should irreversible tasks present for approval?

| Option                       | Description                                                  | Selected |
| ---------------------------- | ------------------------------------------------------------ | -------- |
| Checkpoint pause + messaging | Task enters "review", orchestrator sends message via channel |          |
| Interactive CLI prompt       | Clack prompt in CLI session                                  |          |
| Queue-based review section   | Task moves to review queue section, user reviews via command |          |

**User's choice:** Other (free text)
**Notes:** User described a hybrid: tasks move into a Review state visible on the kanban board column, AND queryable as a list of reviews by any agent or user. Reusable for multiple workflows beyond just verification.

### Q2: Should "review" become a formal queue section?

| Option                           | Description                               | Selected |
| -------------------------------- | ----------------------------------------- | -------- |
| New Review queue section         | 5th queue section, shows as kanban column | ✓        |
| Flag on existing Claimed section | Keep 4 sections, add needs_review flag    |          |

**User's choice:** New Review queue section (Recommended)
**Notes:** None

### Q3: How do users approve or reject?

| Option                          | Description                                                         | Selected |
| ------------------------------- | ------------------------------------------------------------------- | -------- |
| Board interaction + CLI command | Drag on kanban board OR CLI command, both update queue + checkpoint | ✓        |
| CLI command only                | CLI-only, board is read-only                                        |          |
| You decide                      | Claude picks based on existing patterns                             |          |

**User's choice:** Board interaction + CLI command
**Notes:** None

### Q4: Timeout behavior for review tasks?

| Option                               | Description                                                                      | Selected |
| ------------------------------------ | -------------------------------------------------------------------------------- | -------- |
| No timeout — wait indefinitely       | Sit in Review until human acts. Orchestrator can remind but never auto-approves. | ✓        |
| Configurable timeout with escalation | Optional timeout, escalate on expiry, never auto-approve                         |          |

**User's choice:** No timeout — wait indefinitely (Recommended)
**Notes:** None

---

## Task Completion Gating

### Q1: What triggers the verification gate?

| Option                                     | Description                                                                            | Selected |
| ------------------------------------------ | -------------------------------------------------------------------------------------- | -------- |
| Agent reports completion → hook intercepts | "project:task-pre-complete" hook intercepts before Done. Agent doesn't decide if done. | ✓        |
| Agent moves to review explicitly           | Agent is aware of verification_type and moves to Review itself                         |          |
| You decide                                 | Claude picks based on hook capabilities                                                |          |

**User's choice:** Agent reports completion → hook intercepts (Recommended)
**Notes:** None

### Q2: What happens on verification failure?

| Option                                  | Description                                                                    | Selected |
| --------------------------------------- | ------------------------------------------------------------------------------ | -------- |
| Back to Available with failure evidence | Task returns to Available, checkpoint records failure. Any agent can re-claim. | ✓        |
| To Blocked with failure reason          | Task moves to Blocked, requires manual unblock                                 |          |
| Stay in Claimed, flag for retry         | Same agent gets retry flag                                                     |          |

**User's choice:** Back to Available with failure evidence (Recommended)
**Notes:** None

### Q3: Sync or async verification?

| Option                        | Description                                           | Selected |
| ----------------------------- | ----------------------------------------------------- | -------- |
| Synchronous in hook           | Runs inline, task doesn't move to Done until complete | ✓        |
| Async with intermediate state | Moves to "verifying" state, callback resolves         |          |

**User's choice:** Synchronous in hook (Recommended)
**Notes:** None

---

## Mixed Verification Orchestration

### Q1: How should mixed verification combine auto + human?

| Option                   | Description                                                             | Selected |
| ------------------------ | ----------------------------------------------------------------------- | -------- |
| Auto first, then human   | Run auto checks. Pass → Review for human. Fail → Available immediately. | ✓        |
| Parallel — both required | Auto runs, task also moves to Review. Human sees auto results.          |          |
| You decide               | Claude picks sequencing                                                 |          |

**User's choice:** Auto first, then human (Recommended)
**Notes:** None

### Q2: How should external verification work?

| Option                         | Description                                               | Selected |
| ------------------------------ | --------------------------------------------------------- | -------- |
| Same as human — move to Review | Task goes to Review with note about external check needed | ✓        |
| Webhook/callback pattern       | Task publishes request, external system calls back        |          |
| Defer to Phase 4+              | Treat as human for now, proper integration later          |          |

**User's choice:** Same as human — move to Review
**Notes:** None

---

## Claude's Discretion

- Exact schema shape for verification section in checkpoint sidecar
- Hook registration details and event payload structure
- CLI command naming and flags for review approve/reject
- Kanban board UI rendering for Review column
- Internal implementation of check runners

## Deferred Ideas

None — discussion stayed within phase scope
