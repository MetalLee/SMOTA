import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: run } = await supabase
    .from("agent_runs")
    .select("id, project_id, status, current_step, sandbox_name, sandbox_status, sandbox_preview_url, build_status, build_error, fix_attempted")
    .eq("id", runId)
    .eq("owner_id", user.id)
    .single();

  if (!run) {
    return NextResponse.json({ error: "Run not found" }, { status: 404 });
  }

  const { data: sandboxRun } = await supabase.from("sandbox_runs").select("*").eq("run_id", runId).eq("owner_id", user.id).maybeSingle();
  return NextResponse.json({ run, sandboxRun });
}
