/**
 * Factory for wiring the NotifyUserFn stub to a real message sender.
 * Keeps the projects/ layer decoupled from the gateway layer -- the gateway
 * wires sendFn to its sessions_send RPC when creating recovery manager deps.
 *
 * Per Phase 4 CONTEXT.md D-05 and Research Pitfall 6: replaces the log-only
 * defaultNotifyUser stub so escalation notifications reach users.
 */

import { createSubsystemLogger } from "../logging/subsystem.js";
import type { NotifyUserFn } from "./recovery-manager.js";

const log = createSubsystemLogger("projects/notify-user-wire");

/** Options for creating a wired NotifyUserFn. */
export type CreateNotifyUserFnOpts = {
  /** Function that sends a message to the user's session. Typically wraps gateway sessions_send RPC. */
  sendFn: (opts: { sessionKey: string; message: string }) => Promise<void>;
  /** Default session key to use when the recovery context does not provide one. */
  defaultSessionKey?: string;
};

/**
 * Create a NotifyUserFn that sends formatted escalation messages via the provided sendFn.
 * Handles errors gracefully -- sendFn failures are logged but never thrown,
 * so escalation notification failure does not crash recovery.
 */
export function createNotifyUserFn(opts: CreateNotifyUserFnOpts): NotifyUserFn {
  const { sendFn, defaultSessionKey } = opts;

  return async (notifyOpts) => {
    const sessionKey = notifyOpts.sessionKey ?? defaultSessionKey;

    if (!sessionKey) {
      log.warn("No session key available for escalation notification", {
        taskId: notifyOpts.taskId,
      });
      return;
    }

    const lines = [
      `Task ${notifyOpts.taskId} requires attention.`,
      `Failure: ${notifyOpts.failureCategory} - ${notifyOpts.failureReason}`,
      `Recovery attempts: ${notifyOpts.recoveryAttempts}`,
    ];

    if (notifyOpts.workflowId) {
      lines.push(`Workflow: ${notifyOpts.workflowId}`);
    }

    const message = lines.join("\n");

    try {
      await sendFn({ sessionKey, message });
    } catch (err: unknown) {
      // Escalation notification failure should not crash recovery
      log.warn("Failed to send escalation notification", {
        taskId: notifyOpts.taskId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  };
}
