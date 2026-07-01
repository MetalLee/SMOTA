import type { SupabaseClient } from "@supabase/supabase-js";
import { insertRunEvent, type RunContext } from "./sandbox-events";
import { createSupabaseServiceClient } from "./sandbox-client";
import { getNextSandboxWorkflowPhase, isSandboxWorkflowPhase, runVercelSandboxWorkflowPhase } from "./sandbox-workflow";

export type SandboxWorkflowStartState = "claimable" | "already_running" | "finished" | "invalid";
export type SandboxWorkflowJobStatus = "queued" | "running" | "succeeded" | "failed";

export const SANDBOX_WORKFLOW_LEASE_MS = 15 * 60 * 1000;

export interface SandboxWorkflowJobLike {
  status: string;
  lease_expires_at?: string | null;
}

export interface SandboxWorkflowJobRow extends SandboxWorkflowJobLike {
  id: string;
  owner_id: string;
  project_id: string;
  run_id: string;
  current_phase: string | null;
  attempt_count: number;
  lease_owner: string | null;
  lease_expires_at: string | null;
  last_error: string | null;
  started_at: string | null;
  completed_at: string | null;
}

const RUNNING_SANDBOX_WORKFLOW_STEPS = new Set([
  "sandbox_start_queued",
  "creating_sandbox",
  "reusing_sandbox_workspace",
  "sandbox_ready",
  "writing_harness",
  "init_vite",
  "setup_git",
  "corepack",
  "installing_initial",
  "starting_preview",
  "preview_ready",
  "preparing_coding_agent",
  "install_opencode_cli",
  "check_opencode_cli",
  "running_opencode",
  "opencode_run",
  "installing_after_opencode",
  "building",
  "fixing",
  "build_retry",
  "indexing_files",
  "review_screenshot",
  "review_report"
]);

export function getSandboxWorkflowStartState(runStatus: string, currentStep: string | null): SandboxWorkflowStartState {
  if (runStatus === "succeeded" || runStatus === "failed") {
    return "finished";
  }

  if (runStatus === "approved" && currentStep === "approved_waiting_for_sandbox") {
    return "claimable";
  }

  if (runStatus === "failed_retryable") {
    return "claimable";
  }

  if (runStatus === "running" && currentStep && RUNNING_SANDBOX_WORKFLOW_STEPS.has(currentStep)) {
    return "already_running";
  }

  return "invalid";
}

export function isSandboxWorkflowLeaseExpired(leaseExpiresAt: string | null | undefined, now = new Date()): boolean {
  if (!leaseExpiresAt) {
    return true;
  }

  const expiresAt = new Date(leaseExpiresAt).getTime();
  return !Number.isFinite(expiresAt) || expiresAt <= now.getTime();
}

export function buildSandboxWorkflowLease(input: { workerId: string; now?: Date; leaseMs: number }) {
  const now = input.now ?? new Date();
  return {
    lease_owner: input.workerId,
    lease_expires_at: new Date(now.getTime() + input.leaseMs).toISOString()
  };
}

export function shouldDispatchSandboxWorkflowJob(job: SandboxWorkflowJobLike | null | undefined, now = new Date()): boolean {
  if (!job) {
    return false;
  }

  if (job.status === "queued") {
    return true;
  }

  if (job.status === "running") {
    return isSandboxWorkflowLeaseExpired(job.lease_expires_at, now);
  }

  return false;
}

export function buildSandboxWorkflowWorkerId(runId: string, now = new Date()) {
  return `sandbox-workflow:${runId}:${now.getTime()}`;
}

export async function queueSandboxWorkflowJob(supabase: SupabaseClient, context: RunContext) {
  await supabase.from("sandbox_workflow_jobs").upsert(
    {
      owner_id: context.ownerId,
      project_id: context.projectId,
      run_id: context.runId,
      status: "queued",
      current_phase: "queued",
      lease_owner: null,
      lease_expires_at: null,
      last_error: null,
      completed_at: null
    },
    { onConflict: "run_id" }
  );
}

async function loadSandboxWorkflowJob(supabase: SupabaseClient, runId: string): Promise<SandboxWorkflowJobRow | null> {
  const { data } = await supabase.from("sandbox_workflow_jobs").select("*").eq("run_id", runId).maybeSingle();
  return (data as SandboxWorkflowJobRow | null) ?? null;
}

export async function claimSandboxWorkflowJob(
  supabase: SupabaseClient,
  context: RunContext,
  options: { workerId?: string; now?: Date; leaseMs?: number } = {}
): Promise<{ status: "claimed"; job: SandboxWorkflowJobRow } | { status: "already_running" | "finished" | "missing" }> {
  const now = options.now ?? new Date();
  const workerId = options.workerId ?? buildSandboxWorkflowWorkerId(context.runId, now);
  const lease = buildSandboxWorkflowLease({ workerId, now, leaseMs: options.leaseMs ?? SANDBOX_WORKFLOW_LEASE_MS });
  const job = await loadSandboxWorkflowJob(supabase, context.runId);

  if (!job) {
    return { status: "missing" };
  }

  if (job.status === "succeeded" || job.status === "failed") {
    return { status: "finished" };
  }

  if (job.status === "running" && !isSandboxWorkflowLeaseExpired(job.lease_expires_at, now)) {
    return { status: "already_running" };
  }

  const query = supabase
    .from("sandbox_workflow_jobs")
    .update({
      status: "running",
      current_phase: isSandboxWorkflowPhase(job.current_phase) ? job.current_phase : getNextSandboxWorkflowPhase(null),
      attempt_count: Number(job.attempt_count ?? 0) + 1,
      started_at: job.started_at ?? now.toISOString(),
      completed_at: null,
      last_error: null,
      ...lease
    })
    .eq("id", job.id)
    .eq("owner_id", context.ownerId)
    .select("*");

  const guardedQuery =
    job.status === "running"
      ? job.lease_expires_at
        ? query.eq("status", "running").lte("lease_expires_at", now.toISOString())
        : query.eq("status", "running").is("lease_expires_at", null)
      : query.eq("status", "queued");

  const { data: claimed } = await guardedQuery.maybeSingle();
  if (!claimed) {
    return { status: "already_running" };
  }

  return { status: "claimed", job: claimed as SandboxWorkflowJobRow };
}

export async function markSandboxWorkflowJobPhaseQueued(supabase: SupabaseClient, context: RunContext, nextPhase: string | null) {
  await supabase
    .from("sandbox_workflow_jobs")
    .update({
      status: nextPhase ? "queued" : "succeeded",
      current_phase: nextPhase ?? "succeeded",
      lease_owner: null,
      lease_expires_at: null,
      completed_at: nextPhase ? null : new Date().toISOString(),
      last_error: null
    })
    .eq("run_id", context.runId)
    .eq("owner_id", context.ownerId);
}

export async function markSandboxWorkflowJobSucceeded(supabase: SupabaseClient, context: RunContext) {
  await supabase
    .from("sandbox_workflow_jobs")
    .update({
      status: "succeeded",
      current_phase: "succeeded",
      lease_owner: null,
      lease_expires_at: null,
      completed_at: new Date().toISOString(),
      last_error: null
    })
    .eq("run_id", context.runId)
    .eq("owner_id", context.ownerId);
}

export async function markSandboxWorkflowJobFailed(supabase: SupabaseClient, context: RunContext, message: string) {
  await supabase
    .from("sandbox_workflow_jobs")
    .update({
      status: "failed",
      current_phase: "failed",
      lease_owner: null,
      lease_expires_at: null,
      completed_at: new Date().toISOString(),
      last_error: message
    })
    .eq("run_id", context.runId)
    .eq("owner_id", context.ownerId);
}

export async function runVercelSandboxWorkflowJob(runId: string, options: { supabase?: SupabaseClient; env?: Record<string, string | undefined> } = {}) {
  const supabase = options.supabase ?? createSupabaseServiceClient(options.env);
  const { data: run, error } = await supabase.from("agent_runs").select("id, owner_id, project_id").eq("id", runId).single();
  if (error || !run) {
    throw new Error(error?.message ?? "Run not found.");
  }

  const context: RunContext = { ownerId: String(run.owner_id), projectId: String(run.project_id), runId: String(run.id) };
  const claim = await claimSandboxWorkflowJob(supabase, context);
  if (claim.status !== "claimed") {
    await insertRunEvent(supabase, context, {
      eventType: "sandbox.workflow.skipped",
      step: "sandbox_workflow_job",
      message: `Sandbox workflow job skipped: ${claim.status}.`,
      payload: { status: claim.status }
    });
    return { status: claim.status };
  }

  await insertRunEvent(supabase, context, {
    eventType: "sandbox.workflow.started",
    step: "sandbox_workflow_job",
    message: "Sandbox workflow worker started.",
    payload: { jobId: claim.job.id, leaseOwner: claim.job.lease_owner }
  });

  try {
    const phase = isSandboxWorkflowPhase(claim.job.current_phase) ? claim.job.current_phase : getNextSandboxWorkflowPhase(null);
    if (!phase) {
      await markSandboxWorkflowJobSucceeded(supabase, context);
      return { status: "succeeded" as const };
    }

    const result = await runVercelSandboxWorkflowPhase(runId, { supabase, env: options.env, phase });
    if (result.status === "succeeded") {
      await markSandboxWorkflowJobSucceeded(supabase, context);
      await insertRunEvent(supabase, context, { eventType: "sandbox.workflow.succeeded", step: "sandbox_workflow_job", message: "Sandbox workflow worker succeeded." });
    } else if (result.status === "phase_completed") {
      const nextPhase = getNextSandboxWorkflowPhase(phase);
      await markSandboxWorkflowJobPhaseQueued(supabase, context, nextPhase);
      await insertRunEvent(supabase, context, {
        eventType: "sandbox.workflow.phase.completed",
        step: "sandbox_workflow_phase",
        message: nextPhase ? `Sandbox workflow phase ${phase} completed. Next phase: ${nextPhase}.` : `Sandbox workflow phase ${phase} completed.`,
        payload: { phase, nextPhase }
      });
      return { ...result, nextPhase, continue: Boolean(nextPhase) };
    } else {
      const reason = "reason" in result && typeof result.reason === "string" ? result.reason : "Sandbox workflow failed.";
      await markSandboxWorkflowJobFailed(supabase, context, reason);
      await insertRunEvent(supabase, context, {
        eventType: "sandbox.workflow.failed",
        step: "sandbox_workflow_job",
        message: reason,
        stream: "stderr"
      });
    }
    return result;
  } catch (workerError) {
    const message = workerError instanceof Error ? workerError.message : "Sandbox workflow worker failed.";
    await markSandboxWorkflowJobFailed(supabase, context, message);
    await insertRunEvent(supabase, context, {
      eventType: "sandbox.workflow.failed",
      step: "sandbox_workflow_job",
      message,
      stream: "stderr"
    });
    throw workerError;
  }
}
