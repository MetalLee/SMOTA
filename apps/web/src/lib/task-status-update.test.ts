import { describe, expect, it } from "vitest";
import { canUpdateTaskStatus, parseTaskStatusUpdateRequest } from "./task-status-update";

describe("task status update helpers", () => {
  it("accepts a valid bearer token and task status", () => {
    expect(
      parseTaskStatusUpdateRequest({
        authorizationHeader: "Bearer run-token",
        expectedToken: "run-token",
        body: { status: "in_progress" }
      })
    ).toEqual({ ok: true, status: "in_progress" });
  });

  it("rejects missing or mismatched task update tokens", () => {
    expect(
      parseTaskStatusUpdateRequest({
        authorizationHeader: null,
        expectedToken: "run-token",
        body: { status: "done" }
      })
    ).toEqual({ ok: false, statusCode: 401, error: "Unauthorized task status update." });

    expect(
      parseTaskStatusUpdateRequest({
        authorizationHeader: "Bearer wrong-token",
        expectedToken: "run-token",
        body: { status: "done" }
      })
    ).toEqual({ ok: false, statusCode: 401, error: "Unauthorized task status update." });
  });

  it("rejects statuses outside the task lifecycle", () => {
    expect(
      parseTaskStatusUpdateRequest({
        authorizationHeader: "Bearer run-token",
        expectedToken: "run-token",
        body: { status: "blocked" }
      })
    ).toEqual({ ok: false, statusCode: 400, error: "Invalid task status." });
  });

  it("allows only CodingAgent tasks from the current run and owner", () => {
    expect(
      canUpdateTaskStatus({
        task: { id: "task-1", owner_id: "owner-1", run_id: "run-1", agent_name: "CodingAgent" },
        ownerId: "owner-1",
        runId: "run-1"
      })
    ).toEqual({ ok: true });

    expect(
      canUpdateTaskStatus({
        task: { id: "task-1", owner_id: "owner-1", run_id: "run-1", agent_name: "BuildAgent" },
        ownerId: "owner-1",
        runId: "run-1"
      })
    ).toEqual({ ok: false, statusCode: 403, error: "Only CodingAgent tasks can be updated from Sandbox." });

    expect(
      canUpdateTaskStatus({
        task: { id: "task-1", owner_id: "owner-1", run_id: "run-2", agent_name: "CodingAgent" },
        ownerId: "owner-1",
        runId: "run-1"
      })
    ).toEqual({ ok: false, statusCode: 404, error: "Task not found for this run." });
  });
});
