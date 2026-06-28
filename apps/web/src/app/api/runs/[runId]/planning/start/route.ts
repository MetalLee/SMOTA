import { NextResponse } from "next/server";
import { createAgentOrchestrator, generateHarnessBundle } from "@smota/agent-core";
import type { GeneratedRunEvent, GeneratedTask, HarnessArtifact, ProjectCreationInput } from "@smota/shared";
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
    const bundle = await createAgentOrchestrator().generateHarnessBundle(input, {
      onEvent: (event) => insertEvent(supabase, context, event),
      onProjectName: async (projectName) => {
        await supabase.from("projects").update({ name: projectName, updated_at: new Date().toISOString() }).eq("id", run.project_id).eq("owner_id", user.id);
      },
      onArtifact: (artifact) => insertArtifact(supabase, context, artifact),
      onTasks: (tasks) => insertTasks(supabase, context, tasks)
    });

    await supabase
      .from("agent_runs")
      .update({ status: "pending_approval", current_step: "plan_ready", updated_at: new Date().toISOString() })
      .eq("id", run.id)
      .eq("owner_id", user.id);

    return NextResponse.json({ status: "pending_approval", projectName: bundle.projectName });
  } catch (error) {
    const message = error instanceof Error ? error.message : "真实 LLM 规划生成失败，已回退到本地计划生成器。";
    const bundle = generateHarnessBundle(input);
    await Promise.all([
      supabase.from("projects").update({ name: bundle.projectName, updated_at: new Date().toISOString() }).eq("id", run.project_id).eq("owner_id", user.id),
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
