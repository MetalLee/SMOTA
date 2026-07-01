import { NextResponse } from "next/server";
import { runVercelSandboxWorkflowJob } from "@smota/sandbox-runner";
import { buildSandboxWorkerUrl, dispatchSandboxWorkflowWorker, isAuthorizedSandboxWorkerRequest } from "@/lib/sandbox-worker-dispatch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 800;

export async function POST(request: Request) {
  if (!isAuthorizedSandboxWorkerRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as { runId?: string };
  const runId = typeof body.runId === "string" ? body.runId.trim() : "";

  if (!runId) {
    return NextResponse.json({ error: "Missing runId." }, { status: 400 });
  }

  const result = await runVercelSandboxWorkflowJob(runId);
  if (result.status === "phase_completed" && (!("continue" in result) || result.continue !== false)) {
    dispatchSandboxWorkflowWorker({ workerUrl: buildSandboxWorkerUrl(request), runId });
  }

  return NextResponse.json(result, { status: result.status === "failed" ? 500 : 202 });
}
