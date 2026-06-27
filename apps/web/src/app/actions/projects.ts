"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { generateHarnessBundle } from "@smota/agent-core";
import { deriveProjectName, parseProjectCreationInput } from "@smota/shared";
import { createClient } from "@/lib/supabase/server";

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
    error
  } = await supabase.auth.getUser();

  if (error || !user) {
    redirect("/auth/login");
  }

  return { supabase, user };
}

export async function createProjectAction(formData: FormData) {
  const input = parseProjectCreationInput(formData);
  const { supabase, user } = await requireUser();
  const bundle = generateHarnessBundle(input);
  const projectName = deriveProjectName(input.prompt);

  const { data: project, error: projectError } = await supabase
    .from("projects")
    .insert({
      owner_id: user.id,
      name: projectName,
      description: input.prompt,
      prompt: input.prompt,
      app_type: input.appType,
      mode: input.mode,
      status: "planning"
    })
    .select("id")
    .single();

  if (projectError || !project) {
    throw new Error(projectError?.message ?? "创建项目失败。");
  }

  const { data: run, error: runError } = await supabase
    .from("agent_runs")
    .insert({
      owner_id: user.id,
      project_id: project.id,
      mode: input.mode,
      user_prompt: input.prompt,
      status: "pending_approval",
      current_step: "plan_ready",
      runner_provider: "vercel_sandbox",
      sandbox_runtime: process.env.SANDBOX_RUNTIME ?? "node24",
      sandbox_timeout_ms: Number(process.env.SANDBOX_TIMEOUT_MS ?? 2700000),
      fix_attempted: false
    })
    .select("id")
    .single();

  if (runError || !run) {
    throw new Error(runError?.message ?? "创建 AgentRun 失败。");
  }

  const artifacts = bundle.artifacts.map((artifact) => ({
    owner_id: user.id,
    project_id: project.id,
    run_id: run.id,
    type: artifact.type,
    title: artifact.title,
    path: artifact.path,
    content: artifact.content
  }));

  const tasks = bundle.tasks.map((task) => ({
    owner_id: user.id,
    project_id: project.id,
    run_id: run.id,
    title: task.title,
    description: task.description,
    status: task.status,
    sort_order: task.sortOrder
  }));

  const events = bundle.events.map((event) => ({
    owner_id: user.id,
    project_id: project.id,
    run_id: run.id,
    agent_name: event.agentName,
    event_type: event.eventType,
    step: event.step,
    message: event.message,
    stream: event.stream ?? "system",
    metadata: event.metadata ?? {}
  }));

  const [{ error: artifactsError }, { error: tasksError }, { error: eventsError }] = await Promise.all([
    supabase.from("artifacts").insert(artifacts),
    supabase.from("tasks").insert(tasks),
    supabase.from("run_events").insert(events)
  ]);

  if (artifactsError || tasksError || eventsError) {
    throw new Error(artifactsError?.message ?? tasksError?.message ?? eventsError?.message ?? "保存计划失败。");
  }

  redirect(`/projects/${project.id}`);
}

export async function approvePlanAction(formData: FormData) {
  const projectId = String(formData.get("projectId") ?? "");
  const runId = String(formData.get("runId") ?? "");
  const { supabase, user } = await requireUser();

  const { error: updateError } = await supabase
    .from("agent_runs")
    .update({
      status: "approved",
      current_step: "approved_waiting_for_sandbox",
      updated_at: new Date().toISOString()
    })
    .eq("id", runId)
    .eq("project_id", projectId)
    .eq("owner_id", user.id);

  if (updateError) {
    throw new Error(updateError.message);
  }

  const { error: eventError } = await supabase.from("run_events").insert({
    owner_id: user.id,
    project_id: projectId,
    run_id: runId,
    agent_name: "PlannerAgent",
    event_type: "plan.approved",
    step: "approval",
    message: "用户已批准计划。Vercel Sandbox 构建将在后续阶段接入，本阶段不会启动 Sandbox。",
    stream: "system",
    metadata: { sandboxStarted: false }
  });

  if (eventError) {
    throw new Error(eventError.message);
  }

  revalidatePath(`/projects/${projectId}`);
}

export async function deleteProjectAction(formData: FormData) {
  const projectId = String(formData.get("projectId") ?? "");
  const { supabase, user } = await requireUser();

  if (!projectId) {
    throw new Error("缺少项目 ID。");
  }

  const { error } = await supabase.from("projects").delete().eq("id", projectId).eq("owner_id", user.id);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/my-projects");
  revalidatePath("/dashboard");
}
