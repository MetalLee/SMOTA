import { NextResponse } from "next/server";
import { runVercelSandboxWorkflow } from "@smota/sandbox-runner";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

export async function POST(_request: Request, { params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
    error: userError
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: run } = await supabase.from("agent_runs").select("id, owner_id, project_id, status").eq("id", runId).eq("owner_id", user.id).single();
  if (!run) {
    return NextResponse.json({ error: "Run not found" }, { status: 404 });
  }

  if (!["approved", "failed_retryable"].includes(run.status)) {
    return NextResponse.json({ error: "Run must be approved or failed_retryable before starting Sandbox." }, { status: 409 });
  }

  const result = await runVercelSandboxWorkflow(runId);
  return NextResponse.json(result);
}
