import { NextResponse } from "next/server";
import { createSupabaseServiceClient } from "@smota/sandbox-runner";
import { canReadRunSandboxStatus } from "@/lib/sandbox-status-access";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HEALTH_TIMEOUT_MS = 5000;

async function checkPreviewHealth(previewUrl: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS);

  try {
    const response = await fetch(previewUrl, {
      cache: "no-store",
      redirect: "follow",
      signal: controller.signal
    });
    return {
      ok: response.status >= 200 && response.status < 400,
      status: response.status
    };
  } catch {
    return {
      ok: false,
      status: null
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function GET(_request: Request, { params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;
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
    .select("id, owner_id, project_id, sandbox_preview_url")
    .eq("id", runId)
    .single();

  if (!run) {
    return NextResponse.json({ error: "Run not found" }, { status: 404 });
  }

  const { data: project } = await service.from("projects").select("id,is_shared_to_discovery").eq("id", run.project_id).single();
  if (!canReadRunSandboxStatus({ userId: user.id, runOwnerId: run.owner_id, projectShared: Boolean(project?.is_shared_to_discovery) })) {
    return NextResponse.json({ error: "Run not found" }, { status: 404 });
  }

  let previewUrl = typeof run.sandbox_preview_url === "string" ? run.sandbox_preview_url : "";
  if (!previewUrl) {
    const { data: sandboxRun } = await service.from("sandbox_runs").select("preview_url").eq("run_id", runId).maybeSingle();
    previewUrl = typeof sandboxRun?.preview_url === "string" ? sandboxRun.preview_url : "";
  }

  if (!previewUrl) {
    return NextResponse.json({ ok: false, status: null });
  }

  const health = await checkPreviewHealth(previewUrl);
  return NextResponse.json(health);
}
