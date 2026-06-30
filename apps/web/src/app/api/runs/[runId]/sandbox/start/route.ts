import { after, NextResponse } from "next/server";
import {
  createSupabaseServiceClient,
  getSandboxWorkflowStartState,
  insertRunEvent,
  queueSandboxWorkflowJob,
  runVercelSandboxWorkflowJob
} from "@smota/sandbox-runner";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function dispatchSandboxWorkflowJob(runId: string) {
  after(async () => {
    try {
      await runVercelSandboxWorkflowJob(runId);
    } catch (error) {
      console.error("Sandbox workflow job failed", error);
    }
  });
}

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

  const admin = createSupabaseServiceClient();
  const { data: run } = await admin.from("agent_runs").select("id, owner_id, project_id, status, current_step").eq("id", runId).eq("owner_id", user.id).single();
  if (!run) {
    return NextResponse.json({ error: "Run not found" }, { status: 404 });
  }

  const startState = getSandboxWorkflowStartState(String(run.status), typeof run.current_step === "string" ? run.current_step : null);
  if (startState === "finished") {
    return NextResponse.json({ status: startState, currentStep: run.current_step });
  }

  if (startState === "already_running") {
    dispatchSandboxWorkflowJob(runId);
    return NextResponse.json({ status: startState, currentStep: run.current_step }, { status: 202 });
  }

  if (startState !== "claimable") {
    return NextResponse.json({ error: "Run must be approved or failed_retryable before starting Sandbox." }, { status: 409 });
  }

  const claimUpdate = {
    status: "running",
    current_step: "sandbox_start_queued",
    sandbox_status: "queued",
    updated_at: new Date().toISOString()
  };
  let claimQuery = admin.from("agent_runs").update(claimUpdate).eq("id", runId).eq("owner_id", user.id);
  claimQuery =
    run.status === "approved"
      ? claimQuery.eq("status", "approved").eq("current_step", "approved_waiting_for_sandbox")
      : claimQuery.eq("status", "failed_retryable");

  const { data: claimedRun } = await claimQuery.select("id, owner_id, project_id, current_step").maybeSingle();

  if (!claimedRun) {
    const { data: latestRun } = await admin.from("agent_runs").select("status,current_step").eq("id", runId).eq("owner_id", user.id).single();
    const latestState = getSandboxWorkflowStartState(String(latestRun?.status ?? ""), typeof latestRun?.current_step === "string" ? latestRun.current_step : null);
    if (latestState === "already_running") {
      dispatchSandboxWorkflowJob(runId);
      return NextResponse.json({ status: latestState, currentStep: latestRun?.current_step ?? null }, { status: 202 });
    }
    return NextResponse.json({ error: "Run is not claimable for Sandbox start." }, { status: 409 });
  }

  const context = { ownerId: String(run.owner_id), projectId: String(run.project_id), runId: String(run.id) };
  await queueSandboxWorkflowJob(admin, context);
  await insertRunEvent(admin, context, {
    eventType: "sandbox.workflow.queued",
    step: "sandbox_start_queued",
    message: "Sandbox workflow job queued."
  });

  dispatchSandboxWorkflowJob(runId);
  return NextResponse.json({ status: "accepted", currentStep: claimedRun.current_step }, { status: 202 });
}
