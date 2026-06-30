import type { SupabaseClient } from "@supabase/supabase-js";

export type RunEventType =
  | "run.status"
  | "step.status"
  | "agent.reasoning"
  | "sandbox.created"
  | "sandbox.reused"
  | "sandbox.workflow.queued"
  | "sandbox.workflow.started"
  | "sandbox.workflow.skipped"
  | "sandbox.workflow.succeeded"
  | "sandbox.workflow.failed"
  | "sandbox.command.started"
  | "sandbox.command.stdout"
  | "sandbox.command.stderr"
  | "sandbox.command.finished"
  | "artifact.created"
  | "file.indexed"
  | "task.status.updated"
  | "build.started"
  | "build.succeeded"
  | "build.failed"
  | "fix.started"
  | "fix.finished"
  | "preview.ready"
  | "review.screenshot.started"
  | "review.screenshot.saved"
  | "review.screenshot.failed"
  | "review.llm.failed"
  | "run.failed";

export interface RunContext {
  ownerId: string;
  projectId: string;
  runId: string;
}

export async function insertRunEvent(
  supabase: SupabaseClient,
  context: RunContext,
  event: {
    eventType: RunEventType;
    step?: string;
    message: string;
    stream?: "stdout" | "stderr" | "system";
    agentName?: string;
    payload?: Record<string, unknown>;
  }
) {
  await supabase.from("run_events").insert({
    owner_id: context.ownerId,
    project_id: context.projectId,
    run_id: context.runId,
    agent_name: event.agentName ?? null,
    event_type: event.eventType,
    step: event.step ?? null,
    message: event.message,
    stream: event.stream ?? "system",
    payload: event.payload ?? {},
    metadata: event.payload ?? {}
  });
}

export async function updateRunStatus(
  supabase: SupabaseClient,
  context: RunContext,
  patch: Record<string, unknown>
) {
  await supabase
    .from("agent_runs")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", context.runId)
    .eq("project_id", context.projectId)
    .eq("owner_id", context.ownerId);
}
