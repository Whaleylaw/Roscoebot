import { describe, it, expect, vi } from "vitest";
import { createNotifyUserFn } from "./notify-user-wire.js";

describe("createNotifyUserFn", () => {
  it("returns a function matching NotifyUserFn signature", () => {
    const sendFn = vi.fn().mockResolvedValue(undefined);
    const notifyUser = createNotifyUserFn({ sendFn });
    expect(notifyUser).toBeTypeOf("function");
  });

  it("calls sendFn with formatted escalation message containing taskId, workflowId, failureCategory, failureReason", async () => {
    const sendFn = vi.fn().mockResolvedValue(undefined);
    const notifyUser = createNotifyUserFn({ sendFn, defaultSessionKey: "session-1" });

    await notifyUser({
      taskId: "TASK-001",
      workflowId: "WF-001",
      failureCategory: "transient",
      failureReason: "Connection timeout",
      recoveryAttempts: 2,
    });

    expect(sendFn).toHaveBeenCalledOnce();
    const call = sendFn.mock.calls[0][0];
    expect(call.sessionKey).toBe("session-1");
    expect(call.message).toContain("TASK-001");
    expect(call.message).toContain("WF-001");
    expect(call.message).toContain("transient");
    expect(call.message).toContain("Connection timeout");
  });

  it("includes recoveryAttempts count in the message", async () => {
    const sendFn = vi.fn().mockResolvedValue(undefined);
    const notifyUser = createNotifyUserFn({ sendFn, defaultSessionKey: "session-1" });

    await notifyUser({
      taskId: "TASK-002",
      workflowId: null,
      failureCategory: "permanent",
      failureReason: "Missing credentials",
      recoveryAttempts: 5,
    });

    const call = sendFn.mock.calls[0][0];
    expect(call.message).toContain("5");
  });

  it("handles sendFn errors gracefully (logs warning, does not throw)", async () => {
    const sendFn = vi.fn().mockRejectedValue(new Error("Network error"));
    const notifyUser = createNotifyUserFn({ sendFn, defaultSessionKey: "session-1" });

    // Should not throw even though sendFn rejects
    await expect(
      notifyUser({
        taskId: "TASK-003",
        workflowId: "WF-002",
        failureCategory: "unknown",
        failureReason: "Unexpected failure",
        recoveryAttempts: 1,
      }),
    ).resolves.toBeUndefined();
  });

  it("uses sessionKey from opts when provided", async () => {
    const sendFn = vi.fn().mockResolvedValue(undefined);
    const notifyUser = createNotifyUserFn({ sendFn, defaultSessionKey: "default-session" });

    await notifyUser({
      taskId: "TASK-004",
      workflowId: null,
      failureCategory: "transient",
      failureReason: "Timeout",
      recoveryAttempts: 0,
      sessionKey: "override-session",
    });

    const call = sendFn.mock.calls[0][0];
    expect(call.sessionKey).toBe("override-session");
  });

  it("skips notification when no sessionKey available (does not call sendFn)", async () => {
    const sendFn = vi.fn().mockResolvedValue(undefined);
    const notifyUser = createNotifyUserFn({ sendFn });

    await notifyUser({
      taskId: "TASK-005",
      workflowId: null,
      failureCategory: "transient",
      failureReason: "Timeout",
      recoveryAttempts: 0,
    });

    expect(sendFn).not.toHaveBeenCalled();
  });
});
