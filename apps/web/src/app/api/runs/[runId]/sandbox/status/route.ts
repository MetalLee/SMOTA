import { NextResponse } from "next/server";
import { buildSandboxRuntimeConfig, createSupabaseServiceClient, ensureSandboxPreviewServer, getVercelSandbox } from "@smota/sandbox-runner";
import { canReadRunSandboxStatus, shouldAttemptPreviewRecovery } from "@/lib/sandbox-status-access";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const PREVIEW_RECOVERY_COOLDOWN_MS = 60_000;

export async function GET(request: Request, { params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  const { searchParams } = new URL(request.url);
  const ensurePreview = searchParams.get("ensurePreview") === "1";
  const forcePreviewRecovery = searchParams.get("force") === "1";
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const service = createSupabaseServiceClient();
  const { data: run } = await service
    .from("agent_runs")
    .select("id, owner_id, project_id, status, current_step, sandbox_name, sandbox_status, sandbox_preview_url, build_status, build_error, fix_attempted")
    .eq("id", runId)
    .single();

  if (!run) {
    return NextResponse.json({ error: "Run not found" }, { status: 404 });
  }

  const { data: project } = await service.from("projects").select("id,is_shared_to_discovery").eq("id", run.project_id).single();
  if (!canReadRunSandboxStatus({ userId: user.id, runOwnerId: run.owner_id, projectShared: Boolean(project?.is_shared_to_discovery) })) {
    return NextResponse.json({ error: "Run not found" }, { status: 404 });
  }

  let { data: sandboxRun } = await service.from("sandbox_runs").select("*").eq("run_id", runId).maybeSingle();
  let previewRecovered = false;
  let previewRecoverySkipped = false;

  if (
    shouldAttemptPreviewRecovery({
      ensurePreview,
      runStatus: run.status,
      sandboxStatus: run.sandbox_status,
      sandboxName: run.sandbox_name,
      previewUrl: run.sandbox_preview_url
    })
  ) {
    const config = buildSandboxRuntimeConfig(process.env);
    const context = { ownerId: run.owner_id, projectId: run.project_id, runId: run.id };

    try {
      if (!forcePreviewRecovery) {
        const { data: recentRecovery } = await service
          .from("run_events")
          .select("created_at")
          .eq("run_id", runId)
          .eq("owner_id", run.owner_id)
          .eq("event_type", "sandbox.command.started")
          .eq("step", "dev_server_recover")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        const recentRecoveryAt = recentRecovery?.created_at ? new Date(recentRecovery.created_at).getTime() : 0;
        previewRecoverySkipped = Number.isFinite(recentRecoveryAt) && Date.now() - recentRecoveryAt < PREVIEW_RECOVERY_COOLDOWN_MS;
      }

      if (!previewRecoverySkipped) {
        const sandbox = await getVercelSandbox(run.sandbox_name);
        const result = await ensureSandboxPreviewServer({
          supabase: service,
          context,
          sandbox,
          port: config.publishPort,
          timeoutMs: config.timeoutMs
        });
        previewRecovered = result.ready;

        if (result.restarted) {
          await Promise.all([
            service.from("agent_runs").update({ sandbox_status: "previewing", current_step: "preview_recovered", updated_at: new Date().toISOString() }).eq("id", runId).eq("owner_id", user.id),
            service.from("sandbox_runs").update({ status: "previewing", last_error: null, updated_at: new Date().toISOString() }).eq("run_id", runId).eq("owner_id", user.id)
          ]);
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to recover Sandbox preview server.";
      await service.from("sandbox_runs").update({ last_error: message, updated_at: new Date().toISOString() }).eq("run_id", runId).eq("owner_id", user.id);
    }
  }

  const [{ data: refreshedRun }, { data: refreshedSandboxRun }] = await Promise.all([
    service
      .from("agent_runs")
      .select("id, owner_id, project_id, status, current_step, sandbox_name, sandbox_status, sandbox_preview_url, build_status, build_error, fix_attempted")
      .eq("id", runId)
      .single(),
    service.from("sandbox_runs").select("*").eq("run_id", runId).maybeSingle()
  ]);
  sandboxRun = refreshedSandboxRun ?? sandboxRun;
  return NextResponse.json({ run: refreshedRun ?? run, sandboxRun, previewRecovered, previewRecoverySkipped });
}
