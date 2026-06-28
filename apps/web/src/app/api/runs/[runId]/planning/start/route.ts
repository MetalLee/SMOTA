import { NextResponse } from "next/server";
import { createAgentOrchestrator, generateContinuationHarnessBundle, generateHarnessBundle } from "@smota/agent-core";
import type { AgentOrchestratorCallbacks } from "@smota/agent-core";
import type { GeneratedRunEvent, GeneratedTask, HarnessArtifact, ProjectCreationInput } from "@smota/shared";
import { selectContinuationWorkspaceSource } from "@/lib/continuation-run";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
  event: GeneratedRunEvent
) {
  await supabase.from("run_events").insert({
    owner_id: context.ownerId,
    project_id: context.projectId,
    run_id: context.runId,
    agent_name: event.agentName,
    event_type: event.eventType,
    step: event.step,
    message: event.message,
    stream: event.stream ?? "system",
    metadata: event.metadata ?? {}
  });
}

async function insertArtifact(
  supabase: Awaited<ReturnType<typeof createClient>>,
  context: { ownerId: string; projectId: string; runId: string },
  artifact: HarnessArtifact
) {
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
  tasks: GeneratedTask[]
) {
  if (!tasks.length) return;
  await supabase.from("tasks").insert(
    tasks.map((task) => ({
      owner_id: context.ownerId,
      project_id: context.projectId,
      run_id: context.runId,
      title: task.title,
      description: task.description,
      status: task.status,
      sort_order: task.sortOrder
    }))
  );
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

  const { data: project } = await supabase.from("projects").select("*").eq("id", run.project_id).eq("owner_id", user.id).single();
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const context = { ownerId: user.id, projectId: String(run.project_id), runId: String(run.id) };
  const input = toProjectCreationInput(run, project);
  const [{ data: projectRuns }, { data: projectFiles }] = await Promise.all([
    supabase
      .from("agent_runs")
      .select("id,sandbox_name,sandbox_preview_url,current_step,status,sandbox_status,created_at")
      .eq("project_id", run.project_id)
      .eq("owner_id", user.id)
      .order("created_at", { ascending: false }),
    supabase.from("workspace_files").select("run_id,path").eq("project_id", run.project_id).eq("owner_id", user.id).order("path", { ascending: true })
  ]);
  const continuationSource = selectContinuationWorkspaceSource({
    project: { source_project_id: project.source_project_id ?? null },
    currentRunId: String(run.parent_run_id ?? run.id),
    runs: projectRuns ?? [],
    files: projectFiles ?? []
  });

  await Promise.all([
    supabase.from("artifacts").delete().eq("run_id", run.id).eq("owner_id", user.id),
    supabase.from("tasks").delete().eq("run_id", run.id).eq("owner_id", user.id)
  ]);

  await supabase
    .from("agent_runs")
    .update({ status: "planning", current_step: "planning_running", updated_at: new Date().toISOString() })
    .eq("id", run.id)
    .eq("owner_id", user.id);

  try {
    const callbacks: AgentOrchestratorCallbacks = {
      onEvent: (event) => insertEvent(supabase, context, event),
      onProjectName: async (projectName) => {
        if (!continuationSource) {
          await supabase.from("projects").update({ name: projectName, updated_at: new Date().toISOString() }).eq("id", run.project_id).eq("owner_id", user.id);
        }
      },
      onArtifact: (artifact) => insertArtifact(supabase, context, artifact),
      onTasks: (tasks) => insertTasks(supabase, context, tasks)
    };
    const orchestrator = createAgentOrchestrator();
    const sourceArtifacts = continuationSource
      ? await supabase
          .from("artifacts")
          .select("path,content")
          .eq("project_id", run.project_id)
          .eq("run_id", continuationSource.sourceRunId)
          .eq("owner_id", user.id)
      : { data: [] };
    const bundle = continuationSource
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
      .eq("owner_id", user.id);

    return NextResponse.json({ status: "pending_approval", projectName: bundle.projectName });
  } catch (error) {
    const message = error instanceof Error ? error.message : "真实 LLM 规划生成失败，已回退到本地计划生成器。";
    const bundle = continuationSource
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
      insertTasks(supabase, context, bundle.tasks),
      ...bundle.artifacts.map((artifact) => insertArtifact(supabase, context, artifact)),
      ...bundle.events.map((event) => insertEvent(supabase, context, event)),
      insertEvent(supabase, context, {
        agentName: "PlannerAgent",
        eventType: "agent.completed",
        step: "llm_fallback",
        message,
        stream: "stderr",
        metadata: { fallback: true }
      })
    ]);
    await supabase
      .from("agent_runs")
      .update({ status: "pending_approval", current_step: "plan_ready", updated_at: new Date().toISOString() })
      .eq("id", run.id)
      .eq("owner_id", user.id);

    return NextResponse.json({ status: "pending_approval", fallback: true });
  }
}
