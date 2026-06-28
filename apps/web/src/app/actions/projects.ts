"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { parseProjectCreationInput } from "@smota/shared";
import {
  WORKSPACE_DIR,
  buildSandboxName,
  buildSandboxRuntimeConfig,
  createSupabaseServiceClient,
  createVercelSandbox,
  getSandboxPreviewUrl,
  getVercelSandbox,
  sanitizeWorkspacePath
} from "@smota/sandbox-runner";
import { isProjectShareable } from "@/lib/project-sharing";
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

  const { data: sourceRuns } = await admin
    .from("agent_runs")
    .select("*")
    .eq("project_id", sourceProjectId)
    .not("sandbox_name", "is", null)
    .order("created_at", { ascending: false })
    .limit(1);
  const sourceRun = sourceRuns?.[0] as Record<string, unknown> | undefined;
  const sourceSandboxName = typeof sourceRun?.sandbox_name === "string" ? sourceRun.sandbox_name : "";
  if (!sourceSandboxName) {
    throw new Error("源项目没有可复制的 Sandbox。");
  }

  const { data: sourceFiles } = await admin
    .from("workspace_files")
    .select("path,file_type,change_type,size,last_modified_at")
    .eq("project_id", sourceProjectId)
    .order("path", { ascending: true });
  if (!sourceFiles?.length) {
    throw new Error("源项目没有可复制的工程文件。");
  }

  const { data: clonedProject, error: cloneProjectError } = await admin
    .from("projects")
    .insert({
      owner_id: user.id,
      name: `${sourceProject.name}（克隆）`,
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
      status: "succeeded",
      current_step: "cloned_previewing",
      runner_provider: "vercel_sandbox",
      sandbox_status: "creating",
      sandbox_runtime: runtimeConfig.runtime,
      sandbox_timeout_ms: runtimeConfig.timeoutMs,
      build_status: "succeeded",
      fix_attempted: false
    })
    .select("*")
    .single();

  if (cloneRunError || !clonedRun) {
    throw new Error(cloneRunError?.message ?? "创建克隆运行记录失败。");
  }

  const sandboxName = buildSandboxName({ ownerId: user.id, projectId: clonedProject.id, runId: clonedRun.id });
  const sandbox = await createVercelSandbox({ name: sandboxName, config: runtimeConfig });
  const previewUrl = getSandboxPreviewUrl(sandbox, runtimeConfig.publishPort);
  const sourceSandbox = await getVercelSandbox(sourceSandboxName);
  const filesToWrite = [];

  for (const file of sourceFiles as Array<{ path: string }>) {
    const safePath = sanitizeWorkspacePath(file.path);
    const content = await sourceSandbox.readFileToBuffer({ path: `${WORKSPACE_DIR}/${safePath}` });
    if (!content) {
      throw new Error(`源项目文件不可读取：${safePath}`);
    }
    filesToWrite.push({ path: `${WORKSPACE_DIR}/${safePath}`, content });
  }

  await sandbox.writeFiles(filesToWrite);
  await sandbox.runCommand({
    cmd: "sh",
    args: ["-lc", "pnpm install && pnpm dev --host 0.0.0.0 --port 5173 --strictPort"],
    cwd: WORKSPACE_DIR,
    detached: true,
    timeoutMs: runtimeConfig.timeoutMs
  });

  await Promise.all([
    admin
      .from("agent_runs")
      .update({
        sandbox_name: sandboxName,
        sandbox_status: "previewing",
        sandbox_preview_url: previewUrl,
        updated_at: new Date().toISOString()
      })
      .eq("id", clonedRun.id),
    admin.from("sandbox_runs").insert({
      owner_id: user.id,
      project_id: clonedProject.id,
      run_id: clonedRun.id,
      sandbox_name: sandboxName,
      status: "previewing",
      runtime: runtimeConfig.runtime,
      timeout_ms: runtimeConfig.timeoutMs,
      publish_port: runtimeConfig.publishPort,
      preview_url: previewUrl
    }),
    admin.from("workspace_files").insert(
      (sourceFiles as Array<Record<string, unknown>>).map((file) => ({
        owner_id: user.id,
        project_id: clonedProject.id,
        run_id: clonedRun.id,
        path: file.path,
        file_type: file.file_type,
        change_type: "cloned",
        size: file.size,
        last_modified_at: file.last_modified_at
      }))
    ),
    admin.from("run_events").insert({
      owner_id: user.id,
      project_id: clonedProject.id,
      run_id: clonedRun.id,
      agent_name: null,
      event_type: "project.cloned",
      step: "clone",
      message: "项目已从发现克隆，并已启动新的 Sandbox 预览。",
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
  redirect(`/projects/${clonedProject.id}`);
}
