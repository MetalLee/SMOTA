"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { parseProjectCreationInput } from "@smota/shared";
import { buildPlaceholderProjectName } from "@/lib/project-planning";
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
  const projectName = buildPlaceholderProjectName(input.prompt);

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
      status: "planning",
      current_step: "planning_queued",
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

  const { error: taskError } = await supabase.from("tasks").insert({
    owner_id: user.id,
    project_id: project.id,
    run_id: run.id,
    title: "生成项目计划",
    description: "ProductAgent、ArchitectAgent 和 PlannerAgent 正在生成 Harness 文档。",
    status: "in_progress",
    sort_order: 1
  });

  const { error: eventError } = await supabase.from("run_events").insert({
    owner_id: user.id,
    project_id: project.id,
    run_id: run.id,
    agent_name: null,
    event_type: "run.created",
    step: "planning_queued",
    message: "项目已创建，正在准备生成计划。",
    stream: "system",
    metadata: {}
  });

  if (taskError || eventError) {
    throw new Error(taskError?.message ?? eventError?.message ?? "保存项目计划状态失败。");
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
    message: "用户已批准计划。Vercel Sandbox 构建将自动启动。",
    stream: "system",
    metadata: { sandboxAutoStart: true }
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
