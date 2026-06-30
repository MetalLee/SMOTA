import { NextResponse } from "next/server";
import {
  createAgentOrchestrator,
  generateContinuationHarnessBundle,
  generateHarnessBundle,
  generatePlanRevisionHarnessBundle as generateFallbackPlanRevisionHarnessBundle
} from "@smota/agent-core";
import type { AgentOrchestratorCallbacks } from "@smota/agent-core";
import type { GeneratedRunEvent, GeneratedTask, HarnessArtifact, ProjectCreationInput } from "@smota/shared";
import { selectContinuationWorkspaceSource } from "@/lib/continuation-run";
import { getNextPlanningGeneration, isCurrentPlanningGeneration } from "@/lib/project-planning";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const HARNESS_PATHS = ["PROJECT_BRIEF.md", "ARCHITECTURE.md", "ROADMAP.md", "CODEX_TASK_RULES.md", "AGENTS.md"];

function toProjectCreationInput(run: { user_prompt: string; mode: string }, project: { app_type: string }): ProjectCreationInput {
  return {
    prompt: run.user_prompt,
    mode: run.mode === "quick-build" ? "quick-build" : "plan-first",
    appType: ["Web App", "Admin", "Landing Page", "SaaS Demo"].includes(project.app_type)
      ? (project.app_type as ProjectCreationInput["appType"])
      : "Web App"
  };
}

function normalizeAppType(appType: string): ProjectCreationInput["appType"] {
  return ["Web App", "Admin", "Landing Page", "SaaS Demo"].includes(appType) ? (appType as ProjectCreationInput["appType"]) : "Web App";
}

function normalizeMode(mode: string): ProjectCreationInput["mode"] {
  return mode === "quick-build" ? "quick-build" : "plan-first";
}

async function insertEvent(
  supabase: Awaited<ReturnType<typeof createClient>>,
  context: { ownerId: string; projectId: string; runId: string },
  event: GeneratedRunEvent,
  planningGeneration?: number
) {
  if (planningGeneration !== undefined && !(await isActivePlanningGeneration(supabase, context, planningGeneration))) {
    return;
  }

  await supabase.from("run_events").insert({
    owner_id: context.ownerId,
    project_id: context.projectId,
    run_id: context.runId,
    agent_name: event.agentName,
    event_type: event.eventType,
    step: event.step,
    message: event.message,
    stream: event.stream ?? "system",
    metadata: planningGeneration === undefined ? event.metadata ?? {} : { ...(event.metadata ?? {}), planningGeneration }
  });
}

async function insertArtifact(
  supabase: Awaited<ReturnType<typeof createClient>>,
  context: { ownerId: string; projectId: string; runId: string },
  artifact: HarnessArtifact,
  planningGeneration?: number
) {
  if (planningGeneration !== undefined && !(await isActivePlanningGeneration(supabase, context, planningGeneration))) {
    return;
  }

  await supabase.from("artifacts").insert({
    owner_id: context.ownerId,
    project_id: context.projectId,
    run_id: context.runId,
    type: artifact.type,
    title: artifact.title,
    path: artifact.path,
    content: artifact.content
  });
}

async function insertTasks(
  supabase: Awaited<ReturnType<typeof createClient>>,
  context: { ownerId: string; projectId: string; runId: string },
  tasks: GeneratedTask[],
  planningGeneration?: number
) {
  if (!tasks.length) return;
  if (planningGeneration !== undefined && !(await isActivePlanningGeneration(supabase, context, planningGeneration))) {
    return;
  }

  await supabase.from("tasks").insert(
    tasks.map((task) => ({
      owner_id: context.ownerId,
      project_id: context.projectId,
      run_id: context.runId,
      title: task.title,
      description: task.description,
      status: task.status,
      agent_name: task.agentName,
      sort_order: task.sortOrder
    }))
  );
}

async function isActivePlanningGeneration(
  supabase: Awaited<ReturnType<typeof createClient>>,
  context: { ownerId: string; projectId: string; runId: string },
  planningGeneration: number
) {
  const { data: run } = await supabase
    .from("agent_runs")
    .select("planning_generation,status")
    .eq("id", context.runId)
    .eq("project_id", context.projectId)
    .eq("owner_id", context.ownerId)
    .single();

  return isCurrentPlanningGeneration((run as { planning_generation?: unknown } | null)?.planning_generation, planningGeneration) && run?.status === "planning";
}

export async function POST(_request: Request, { params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: run } = await supabase.from("agent_runs").select("*").eq("id", runId).eq("owner_id", user.id).single();
  if (!run) {
    return NextResponse.json({ error: "Run not found" }, { status: 404 });
  }

  if (run.status !== "planning" || run.current_step !== "planning_queued") {
    return NextResponse.json({ status: run.status, currentStep: run.current_step });
  }

  const planningGeneration = getNextPlanningGeneration((run as { planning_generation?: unknown }).planning_generation);
  const { data: claimedRun } = await supabase
    .from("agent_runs")
    .update({ status: "planning", current_step: "planning_running", planning_generation: planningGeneration, updated_at: new Date().toISOString() })
    .eq("id", run.id)
    .eq("owner_id", user.id)
    .eq("status", "planning")
    .eq("current_step", "planning_queued")
    .eq("planning_generation", (run as { planning_generation?: number }).planning_generation ?? 0)
    .select("id")
    .maybeSingle();

  if (!claimedRun) {
    const { data: latestRun } = await supabase.from("agent_runs").select("status,current_step").eq("id", runId).eq("owner_id", user.id).single();
    return NextResponse.json({ status: latestRun?.status ?? "planning", currentStep: latestRun?.current_step ?? null });
  }

  const { data: project } = await supabase.from("projects").select("*").eq("id", run.project_id).eq("owner_id", user.id).single();
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const context = { ownerId: user.id, projectId: String(run.project_id), runId: String(run.id) };
  const input = toProjectCreationInput(run, project);
  const [{ data: projectRuns }, { data: projectFiles }, { data: existingArtifacts }] = await Promise.all([
    supabase
      .from("agent_runs")
      .select("id,sandbox_name,sandbox_preview_url,current_step,status,sandbox_status,created_at")
      .eq("project_id", run.project_id)
      .eq("owner_id", user.id)
      .order("created_at", { ascending: false }),
    supabase.from("workspace_files").select("run_id,path").eq("project_id", run.project_id).eq("owner_id", user.id).order("path", { ascending: true }),
    supabase
      .from("artifacts")
      .select("path,content")
      .eq("project_id", run.project_id)
      .eq("run_id", run.id)
      .eq("owner_id", user.id)
      .in("path", HARNESS_PATHS)
  ]);
  const existingHarnessArtifacts = (existingArtifacts ?? []).map((artifact: { path: string; content: string }) => ({
    path: artifact.path,
    content: artifact.content
  }));
  const isPlanRevision = existingHarnessArtifacts.length > 0;
  const continuationSource = selectContinuationWorkspaceSource({
    project: { source_project_id: project.source_project_id ?? null },
    currentRunId: String(run.parent_run_id ?? run.id),
    runs: projectRuns ?? [],
    files: projectFiles ?? []
  });

  await Promise.all([
    supabase.from("artifacts").delete().eq("run_id", run.id).eq("owner_id", user.id),
    supabase.from("tasks").delete().eq("run_id", run.id).eq("owner_id", user.id),
    supabase
      .from("run_events")
      .delete()
      .eq("run_id", run.id)
      .eq("owner_id", user.id)
      .in("agent_name", ["ProductAgent", "ArchitectAgent", "PlannerAgent"])
  ]);

  try {
    const callbacks: AgentOrchestratorCallbacks = {
      onEvent: (event) => insertEvent(supabase, context, event, planningGeneration),
      onProjectName: async (projectName) => {
        if (!(await isActivePlanningGeneration(supabase, context, planningGeneration))) {
          return;
        }
        if (!continuationSource) {
          await supabase.from("projects").update({ name: projectName, updated_at: new Date().toISOString() }).eq("id", run.project_id).eq("owner_id", user.id);
        }
      },
      onArtifact: (artifact) => insertArtifact(supabase, context, artifact, planningGeneration),
      onTasks: (tasks) => insertTasks(supabase, context, tasks, planningGeneration)
    };
    const orchestrator = createAgentOrchestrator();
    const sourceArtifacts = !isPlanRevision && continuationSource
      ? await supabase
          .from("artifacts")
          .select("path,content")
          .eq("project_id", run.project_id)
          .eq("run_id", continuationSource.sourceRunId)
          .eq("owner_id", user.id)
      : { data: [] };
    const bundle = isPlanRevision
      ? await orchestrator.generatePlanRevisionHarnessBundle(
          {
            originalPrompt: project.prompt ?? project.description ?? "",
            revisionPrompt: run.user_prompt,
            mode: normalizeMode(run.mode),
            appType: normalizeAppType(project.app_type),
            previousArtifacts: existingHarnessArtifacts
          },
          callbacks
        )
      : continuationSource
        ? await orchestrator.generateContinuationHarnessBundle(
            {
            originalPrompt: project.prompt ?? project.description ?? "",
            changePrompt: run.user_prompt,
            mode: normalizeMode(run.mode),
            appType: normalizeAppType(project.app_type),
            sourceKind: continuationSource.isClonedWorkspace ? "cloned_workspace" : "own_previous_run",
            previousArtifacts: (sourceArtifacts.data ?? []).map((artifact: { path: string; content: string }) => ({
              path: artifact.path,
              content: artifact.content
            })),
            workspaceFiles: continuationSource.workspaceFiles.map((file) => file.path)
          },
          callbacks
        )
      : await orchestrator.generateHarnessBundle(input, callbacks);

    await supabase
      .from("agent_runs")
      .update({ status: "pending_approval", current_step: "plan_ready", updated_at: new Date().toISOString() })
      .eq("id", run.id)
      .eq("owner_id", user.id)
      .eq("planning_generation", planningGeneration);

    return NextResponse.json({ status: "pending_approval", projectName: bundle.projectName });
  } catch (error) {
    const message = error instanceof Error ? error.message : "真实 LLM 规划生成失败，已回退到本地计划生成器。";
    const bundle = isPlanRevision
      ? generateFallbackPlanRevisionHarnessBundle({
          originalPrompt: project.prompt ?? project.description ?? "",
          revisionPrompt: run.user_prompt,
          mode: normalizeMode(run.mode),
          appType: normalizeAppType(project.app_type),
          previousArtifacts: existingHarnessArtifacts
        })
      : continuationSource
      ? generateContinuationHarnessBundle({
          originalPrompt: project.prompt ?? project.description ?? "",
          changePrompt: run.user_prompt,
          mode: normalizeMode(run.mode),
          appType: normalizeAppType(project.app_type),
          sourceKind: continuationSource.isClonedWorkspace ? "cloned_workspace" : "own_previous_run",
          workspaceFiles: continuationSource.workspaceFiles.map((file) => file.path)
        })
      : generateHarnessBundle(input);
    await Promise.all([
      continuationSource
        ? Promise.resolve()
        : supabase.from("projects").update({ name: bundle.projectName, updated_at: new Date().toISOString() }).eq("id", run.project_id).eq("owner_id", user.id),
      insertTasks(supabase, context, bundle.tasks, planningGeneration),
      ...bundle.artifacts.map((artifact) => insertArtifact(supabase, context, artifact, planningGeneration)),
      ...bundle.events.map((event) => insertEvent(supabase, context, event, planningGeneration)),
      insertEvent(supabase, context, {
        agentName: "PlannerAgent",
        eventType: "agent.failed",
        step: "llm_fallback",
        message,
        stream: "stderr",
        metadata: { fallback: true }
      }, planningGeneration)
    ]);
    await supabase
      .from("agent_runs")
      .update({ status: "pending_approval", current_step: "plan_ready", updated_at: new Date().toISOString() })
      .eq("id", run.id)
      .eq("owner_id", user.id)
      .eq("planning_generation", planningGeneration);

    return NextResponse.json({ status: "pending_approval", fallback: true });
  }
}
