export type TaskLifecycleStatus = "todo" | "in_progress" | "done" | "failed";

export interface TaskStatusUpdateTask {
  id: string;
  owner_id: string;
  run_id: string | null;
  agent_name: string | null;
}

const TASK_STATUSES = new Set<TaskLifecycleStatus>(["todo", "in_progress", "done", "failed"]);

function bearerToken(authorizationHeader: string | null): string | null {
  const match = authorizationHeader?.match(/^Bearer\s+(.+)$/i);
  return match?.[1] ?? null;
}

export function parseTaskStatusUpdateRequest(input: {
  authorizationHeader: string | null;
  expectedToken: string;
  body: unknown;
}): { ok: true; status: TaskLifecycleStatus } | { ok: false; statusCode: number; error: string } {
  if (!input.expectedToken || bearerToken(input.authorizationHeader) !== input.expectedToken) {
    return { ok: false, statusCode: 401, error: "Unauthorized task status update." };
  }

  const status = typeof input.body === "object" && input.body !== null ? (input.body as { status?: unknown }).status : null;
  if (typeof status !== "string" || !TASK_STATUSES.has(status as TaskLifecycleStatus)) {
    return { ok: false, statusCode: 400, error: "Invalid task status." };
  }

  return { ok: true, status: status as TaskLifecycleStatus };
}

export function canUpdateTaskStatus(input: {
  task: TaskStatusUpdateTask | null;
  ownerId: string;
  runId: string;
}): { ok: true } | { ok: false; statusCode: number; error: string } {
  if (!input.task || input.task.owner_id !== input.ownerId || input.task.run_id !== input.runId) {
    return { ok: false, statusCode: 404, error: "Task not found for this run." };
  }

  if (input.task.agent_name !== "CodingAgent") {
    return { ok: false, statusCode: 403, error: "Only CodingAgent tasks can be updated from Sandbox." };
  }

  return { ok: true };
}
