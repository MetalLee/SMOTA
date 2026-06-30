import { NextResponse } from "next/server";
import { createSupabaseServiceClient, getVercelSandbox } from "@smota/sandbox-runner";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(_request: Request, { params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: run } = await supabase.from("agent_runs").select("id, owner_id, project_id, sandbox_name").eq("id", runId).eq("owner_id", user.id).single();
  if (!run?.sandbox_name) {
    return NextResponse.json({ error: "Run has no active Sandbox name." }, { status: 404 });
  }

  const service = createSupabaseServiceClient();
  try {
    const sandbox = await getVercelSandbox(run.sandbox_name);
    await sandbox.stop();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to stop Sandbox.";
    await service.from("sandbox_runs").update({ status: "stopped", last_error: message }).eq("run_id", runId).eq("owner_id", user.id);
    return NextResponse.json({ error: message }, { status: 502 });
  }

  await Promise.all([
    service.from("agent_runs").update({ sandbox_status: "stopped", updated_at: new Date().toISOString() }).eq("id", runId).eq("owner_id", user.id),
    service.from("sandbox_runs").update({ status: "stopped", updated_at: new Date().toISOString() }).eq("run_id", runId).eq("owner_id", user.id),
    service
      .from("sandbox_workflow_jobs")
      .update({
        status: "failed",
        current_phase: "stopped",
        lease_owner: null,
        lease_expires_at: null,
        last_error: "Sandbox stopped by user.",
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq("run_id", runId)
      .eq("owner_id", user.id),
    service.from("run_events").insert({
      owner_id: user.id,
      project_id: run.project_id,
      run_id: runId,
      agent_name: null,
      event_type: "run.status",
      step: "sandbox_stopped",
      message: "Vercel Sandbox stopped.",
      stream: "system",
      payload: {},
      metadata: {}
    })
  ]);

  return NextResponse.json({ status: "stopped" });
}
