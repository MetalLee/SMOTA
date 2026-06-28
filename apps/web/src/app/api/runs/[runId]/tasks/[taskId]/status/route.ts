import { NextResponse } from "next/server";
import { buildTaskUpdateToken, getTaskUpdateSecret, createSupabaseServiceClient } from "@smota/sandbox-runner";
import { canUpdateTaskStatus, parseTaskStatusUpdateRequest } from "@/lib/task-status-update";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ runId: string; taskId: string }> }) {
  const { runId, taskId } = await params;
  const supabase = createSupabaseServiceClient();

  const { data: run } = await supabase
    .from("agent_runs")
    .select("id, owner_id, project_id")
    .eq("id", runId)
    .single();

  if (!run) {
    return NextResponse.json({ error: "Run not found." }, { status: 404 });
  }

  const secret = getTaskUpdateSecret(process.env);
  if (!secret) {
    return NextResponse.json({ error: "Task update secret is not configured." }, { status: 500 });
  }

  const body = await request.json().catch(() => null);
  const parsed = parseTaskStatusUpdateRequest({
    authorizationHeader: request.headers.get("authorization"),
    expectedToken: buildTaskUpdateToken({ ownerId: String(run.owner_id), runId: String(run.id), secret }),
    body
  });

  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: parsed.statusCode });
  }

  const { data: task } = await supabase
    .from("tasks")
    .select("id, owner_id, run_id, agent_name")
    .eq("id", taskId)
    .eq("run_id", runId)
    .maybeSingle();

  const allowed = canUpdateTaskStatus({
    task: task as { id: string; owner_id: string; run_id: string | null; agent_name: string | null } | null,
    ownerId: String(run.owner_id),
    runId: String(run.id)
  });

  if (!allowed.ok) {
    return NextResponse.json({ error: allowed.error }, { status: allowed.statusCode });
  }

  await supabase
    .from("tasks")
    .update({ status: parsed.status, updated_at: new Date().toISOString() })
    .eq("id", taskId)
    .eq("run_id", runId)
    .eq("owner_id", run.owner_id);

  await supabase.from("run_events").insert({
    owner_id: run.owner_id,
    project_id: run.project_id,
    run_id: run.id,
    agent_name: "CodingAgent",
    event_type: "task.status.updated",
    step: "task_status",
    message: `Task ${taskId} marked ${parsed.status}.`,
    stream: "system",
    payload: { taskId, status: parsed.status },
    metadata: { taskId, status: parsed.status }
  });

  return NextResponse.json({ status: parsed.status });
}
