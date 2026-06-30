"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { parseProjectCreationInput } from "@smota/shared";
import {
  buildSandboxRuntimeConfig,
  createSupabaseServiceClient,
  deleteVercelSandbox,
  isVercelSandboxNotFoundError
} from "@smota/sandbox-runner";
import { buildClonedArtifactRows, buildCloneProjectName } from "@/lib/project-clone";
import { isProjectShareable } from "@/lib/project-sharing";
import { selectContinuationWorkspaceSource } from "@/lib/continuation-run";
import { buildPlaceholderProjectName, canRevisePendingPlan, canStartContinuationRun, getNextPlanningGeneration } from "@/lib/project-planning";
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
      planning_generation: 0,
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
    agent_name: "PlannerAgent",
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

  const { data: approvedRuns, error: updateError } = await supabase
    .from("agent_runs")
    .update({
      status: "approved",
      current_step: "approved_waiting_for_sandbox",
      updated_at: new Date().toISOString()
    })
    .eq("id", runId)
    .eq("project_id", projectId)
    .eq("owner_id", user.id)
    .in("status", ["draft", "pending_approval"])
    .select("id");

  if (updateError) {
    throw new Error(updateError.message);
  }

  if (!approvedRuns?.length) {
    revalidatePath(`/projects/${projectId}`);
    return;
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
  const admin = createSupabaseServiceClient();

  if (!projectId) {
    throw new Error("缺少项目 ID。");
  }

  const [{ data: runs }, { data: sandboxRuns }] = await Promise.all([
    admin.from("agent_runs").select("sandbox_name").eq("project_id", projectId).eq("owner_id", user.id),
    admin.from("sandbox_runs").select("sandbox_name").eq("project_id", projectId).eq("owner_id", user.id)
  ]);
  const sandboxNames = [
    ...new Set(
      [...(runs ?? []), ...(sandboxRuns ?? [])]
        .map((row) => (typeof row.sandbox_name === "string" ? row.sandbox_name.trim() : ""))
        .filter(Boolean)
    )
  ];

  for (const sandboxName of sandboxNames) {
    try {
      await deleteVercelSandbox(sandboxName);
    } catch (error) {
      if (!isVercelSandboxNotFoundError(error)) {
        const message = error instanceof Error ? error.message : "删除 Vercel Sandbox 失败。";
        throw new Error(`删除绑定的 Vercel Sandbox 失败：${sandboxName}。${message}`);
      }
    }
  }

  const { error } = await supabase.from("projects").delete().eq("id", projectId).eq("owner_id", user.id);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/my-projects");
  revalidatePath("/dashboard");
}

export async function continueProjectAction(formData: FormData) {
  const projectId = String(formData.get("projectId") ?? "");
  const currentRunId = String(formData.get("runId") ?? "");
  const prompt = String(formData.get("prompt") ?? "").replace(/\s+/g, " ").trim();
  const { supabase, user } = await requireUser();

  if (!projectId || !currentRunId) {
    throw new Error("缺少项目或 Run ID。");
  }

  if (prompt.length < 4) {
    throw new Error("请输入至少 4 个字符的修改需求。");
  }

  const [{ data: project }, { data: currentRun }, { data: runs }, { data: files }] = await Promise.all([
    supabase.from("projects").select("*").eq("id", projectId).eq("owner_id", user.id).single(),
    supabase.from("agent_runs").select("*").eq("id", currentRunId).eq("project_id", projectId).eq("owner_id", user.id).single(),
    supabase
      .from("agent_runs")
      .select("id,sandbox_name,sandbox_preview_url,current_step,status,sandbox_status,created_at")
      .eq("project_id", projectId)
      .eq("owner_id", user.id)
      .order("created_at", { ascending: false }),
    supabase.from("workspace_files").select("run_id,path").eq("project_id", projectId).eq("owner_id", user.id).order("path", { ascending: true })
  ]);

  if (!project || !currentRun) {
    throw new Error("项目或当前 Run 不存在。");
  }

  if (!canStartContinuationRun(String(currentRun.status))) {
    throw new Error("只有已完成或已失败的 Run 可以继续开发。");
  }

  const source = selectContinuationWorkspaceSource({
    project: { source_project_id: project.source_project_id ?? null },
    currentRunId,
    runs: runs ?? [],
    files: files ?? []
  });

  if (!source) {
    throw new Error("当前项目没有可继续开发的 Sandbox 文件，请重新生成或重新克隆。");
  }

  const { data: run, error: runError } = await supabase
    .from("agent_runs")
    .insert({
      owner_id: user.id,
      project_id: projectId,
      parent_run_id: currentRunId,
      mode: currentRun.mode,
      user_prompt: prompt,
      status: "planning",
      current_step: "planning_queued",
      runner_provider: "vercel_sandbox",
      sandbox_name: source.sourceSandboxName,
      sandbox_status: "ready",
      sandbox_preview_url: source.sourcePreviewUrl,
      sandbox_runtime: currentRun.sandbox_runtime ?? process.env.SANDBOX_RUNTIME ?? "node24",
      sandbox_timeout_ms: currentRun.sandbox_timeout_ms ?? Number(process.env.SANDBOX_TIMEOUT_MS ?? 2700000),
      fix_attempted: false
    })
    .select("id")
    .single();

  if (runError || !run) {
    throw new Error(runError?.message ?? "创建继续开发 Run 失败。");
  }

  const sourceLabel = source.isClonedWorkspace ? "克隆项目" : "当前项目";
  await Promise.all([
    supabase.from("tasks").insert({
      owner_id: user.id,
      project_id: projectId,
      run_id: run.id,
      title: "生成继续开发计划",
      description: "ProductAgent、ArchitectAgent 和 PlannerAgent 会基于已有文件生成增量计划。",
      status: "in_progress",
      agent_name: "PlannerAgent",
      sort_order: 1
    }),
    supabase.from("run_events").insert({
      owner_id: user.id,
      project_id: projectId,
      run_id: run.id,
      agent_name: null,
      event_type: "run.continuation.created",
      step: "planning_queued",
      message: `已基于${sourceLabel}已有 Sandbox 文件创建继续开发 Run。`,
      stream: "system",
      metadata: {
        sourceRunId: source.sourceRunId,
        sourceSandboxName: source.sourceSandboxName,
        source: source.isClonedWorkspace ? "cloned_workspace" : "own_previous_run"
      }
    })
  ]);

  revalidatePath(`/projects/${projectId}`);
  return { runId: run.id };
}

export async function revisePlanAction(formData: FormData) {
  const projectId = String(formData.get("projectId") ?? "");
  const runId = String(formData.get("runId") ?? "");
  const prompt = String(formData.get("prompt") ?? "").replace(/\s+/g, " ").trim();
  const { supabase, user } = await requireUser();

  if (!projectId || !runId) {
    throw new Error("缺少项目或 Run ID。");
  }

  if (prompt.length < 4) {
    throw new Error("请输入至少 4 个字符的计划修改意见。");
  }

  const { data: run } = await supabase
    .from("agent_runs")
    .select("status,current_step,planning_generation")
    .eq("id", runId)
    .eq("project_id", projectId)
    .eq("owner_id", user.id)
    .single();

  if (!run || !canRevisePendingPlan(String(run.status), typeof run.current_step === "string" ? run.current_step : null)) {
    throw new Error("只有待批准的计划可以在批准前修改。");
  }

  const now = new Date().toISOString();
  const nextPlanningGeneration = getNextPlanningGeneration((run as { planning_generation?: unknown }).planning_generation);
  const { error: updateError } = await supabase
    .from("agent_runs")
    .update({
      user_prompt: prompt,
      status: "planning",
      current_step: "planning_queued",
      planning_generation: nextPlanningGeneration,
      updated_at: now
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
    agent_name: null,
    event_type: "plan.revision.requested",
    step: "planning_queued",
    message: "用户提交了计划修改意见，ProductAgent、ArchitectAgent 和 PlannerAgent 将基于已有 Harness 重新生成计划。",
    stream: "system",
    metadata: { prompt, planningGeneration: nextPlanningGeneration }
  });

  if (eventError) {
    throw new Error(eventError.message);
  }

  revalidatePath(`/projects/${projectId}`);
  return { runId };
}

export async function updateProjectShareAction(formData: FormData) {
  const projectId = String(formData.get("projectId") ?? "");
  const shared = String(formData.get("shared") ?? "true") === "true";
  const { supabase, user } = await requireUser();

  if (!projectId) {
    throw new Error("缺少项目 ID。");
  }

  const { data: runs } = await supabase
    .from("agent_runs")
    .select("status,sandbox_status,sandbox_preview_url")
    .eq("project_id", projectId)
    .eq("owner_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1);
  const run = runs?.[0] as { status: string; sandbox_status: string | null; sandbox_preview_url: string | null } | undefined;

  if (shared && !isProjectShareable({ runStatus: run?.status ?? "", sandboxStatus: run?.sandbox_status, previewUrl: run?.sandbox_preview_url })) {
    throw new Error("只有已完成并处于预览中的应用可以共享到发现。");
  }

  const { error } = await supabase
    .from("projects")
    .update({
      is_shared_to_discovery: shared,
      shared_at: shared ? new Date().toISOString() : null,
      updated_at: new Date().toISOString()
    })
    .eq("id", projectId)
    .eq("owner_id", user.id);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/resource");
}

export async function toggleFavoriteProjectAction(formData: FormData) {
  const projectId = String(formData.get("projectId") ?? "");
  const favorite = String(formData.get("favorite") ?? "true") === "true";
  const { supabase, user } = await requireUser();

  if (!projectId) {
    throw new Error("缺少项目 ID。");
  }

  const { data: visibleProject } = await supabase.from("projects").select("id").eq("id", projectId).maybeSingle();
  if (!visibleProject) {
    throw new Error("项目不可收藏。");
  }

  if (favorite) {
    const { error } = await supabase.from("project_favorites").upsert({ owner_id: user.id, project_id: projectId }, { onConflict: "owner_id,project_id" });
    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabase.from("project_favorites").delete().eq("owner_id", user.id).eq("project_id", projectId);
    if (error) throw new Error(error.message);
  }

  revalidatePath(`/share/${projectId}`);
  revalidatePath("/my-projects");
}

export async function cloneSharedProjectAction(formData: FormData) {
  const sourceProjectId = String(formData.get("projectId") ?? "");
  const requestedProjectName = String(formData.get("projectName") ?? "");
  const { user } = await requireUser();
  const admin = createSupabaseServiceClient();

  if (!sourceProjectId) {
    throw new Error("缺少项目 ID。");
  }

  const { data: sourceProject, error: projectError } = await admin
    .from("projects")
    .select("*")
    .eq("id", sourceProjectId)
    .eq("is_shared_to_discovery", true)
    .single();

  if (projectError || !sourceProject) {
    throw new Error(projectError?.message ?? "共享项目不存在。");
  }

  const { data: sourceSandboxRuns } = await admin
    .from("sandbox_runs")
    .select("preview_image_url")
    .eq("project_id", sourceProjectId)
    .order("updated_at", { ascending: false })
    .limit(1);
  const sourcePreviewImageUrl =
    typeof sourceSandboxRuns?.[0]?.preview_image_url === "string" && sourceSandboxRuns[0].preview_image_url.trim()
      ? sourceSandboxRuns[0].preview_image_url.trim()
      : null;
  const { data: sourceArtifacts } = await admin
    .from("artifacts")
    .select("type,title,path,content,created_at")
    .eq("project_id", sourceProjectId)
    .order("created_at", { ascending: true });

  const { data: clonedProject, error: cloneProjectError } = await admin
    .from("projects")
    .insert({
      owner_id: user.id,
      name: buildCloneProjectName(String(sourceProject.name ?? ""), requestedProjectName),
      description: sourceProject.description,
      prompt: sourceProject.prompt,
      app_type: sourceProject.app_type,
      mode: sourceProject.mode,
      status: "succeeded",
      is_shared_to_discovery: false,
      source_project_id: sourceProjectId
    })
    .select("*")
    .single();

  if (cloneProjectError || !clonedProject) {
    throw new Error(cloneProjectError?.message ?? "创建克隆项目失败。");
  }

  const runtimeConfig = buildSandboxRuntimeConfig(process.env);
  const { data: clonedRun, error: cloneRunError } = await admin
    .from("agent_runs")
    .insert({
      owner_id: user.id,
      project_id: clonedProject.id,
      mode: sourceProject.mode,
      user_prompt: sourceProject.prompt,
      status: "running",
      current_step: "clone_queued",
      planning_generation: 0,
      runner_provider: "vercel_sandbox",
      sandbox_status: "pending",
      sandbox_runtime: runtimeConfig.runtime,
      sandbox_timeout_ms: runtimeConfig.timeoutMs,
      build_status: "pending",
      fix_attempted: false
    })
    .select("*")
    .single();

  if (cloneRunError || !clonedRun) {
    throw new Error(cloneRunError?.message ?? "创建克隆运行记录失败。");
  }

  const clonedArtifactRows = buildClonedArtifactRows(sourceArtifacts ?? [], {
    ownerId: user.id,
    projectId: clonedProject.id,
    runId: clonedRun.id
  });

  await Promise.all([
    clonedArtifactRows.length ? admin.from("artifacts").insert(clonedArtifactRows) : Promise.resolve({ error: null }),
    admin.from("sandbox_runs").insert({
      owner_id: user.id,
      project_id: clonedProject.id,
      run_id: clonedRun.id,
      sandbox_name: null,
      status: "pending",
      runtime: runtimeConfig.runtime,
      timeout_ms: runtimeConfig.timeoutMs,
      publish_port: runtimeConfig.publishPort,
      preview_url: null,
      preview_image_url: sourcePreviewImageUrl
    }),
    admin.from("tasks").insert({
      owner_id: user.id,
      project_id: clonedProject.id,
      run_id: clonedRun.id,
      title: "克隆项目工作区",
      description: "正在复制源项目文件并启动新的 Vercel Sandbox 预览。",
      status: "in_progress",
      agent_name: "CodingAgent",
      sort_order: 1
    }),
    admin.from("run_events").insert({
      owner_id: user.id,
      project_id: clonedProject.id,
      run_id: clonedRun.id,
      agent_name: null,
      event_type: "project.clone.queued",
      step: "clone_queued",
      message: "已创建克隆项目，正在准备复制源项目工作区。",
      stream: "system",
      metadata: { sourceProjectId }
    })
  ]);

  const { error: cloneCountError } = await admin.rpc("increment_project_clone_count", { target_project_id: sourceProjectId });
  if (cloneCountError) {
    throw new Error(cloneCountError.message);
  }

  revalidatePath("/my-projects");
  revalidatePath(`/share/${sourceProjectId}`);
  return { projectId: String(clonedProject.id) };
}
