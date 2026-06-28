import { NextResponse } from "next/server";
import {
  WORKSPACE_DIR,
  buildSandboxName,
  buildSandboxRuntimeConfig,
  buildViteDevServerArgs,
  buildVitePreviewConfigContent,
  commandOutput,
  createSupabaseServiceClient,
  createVercelSandbox,
  getSandboxPreviewUrl,
  getVercelSandbox,
  runSandboxCommand,
  scanWorkspaceFiles
} from "@smota/sandbox-runner";
import {
  buildCloneCommandFailureMessage,
  buildCloneWorkspaceArchiveCommand,
  buildExtractCloneWorkspaceArchiveCommand,
  buildCloneStepFailureMessage,
  getCloneWorkspaceBootstrapCwd,
  getCloneStartState,
  getCloneSourceSandboxCandidates,
  formatCloneWorkflowError
} from "@/lib/project-clone";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

function quoteArgs(args: string[]) {
  return args.map((arg) => `'${arg.replaceAll("'", "'\\''")}'`).join(" ");
}

async function insertRunEvent(
  admin: ReturnType<typeof createSupabaseServiceClient>,
  input: {
    ownerId: string;
    projectId: string;
    runId: string;
    eventType: string;
    step: string;
    message: string;
    stream?: string;
    metadata?: Record<string, unknown>;
  }
) {
  await admin.from("run_events").insert({
    owner_id: input.ownerId,
    project_id: input.projectId,
    run_id: input.runId,
    agent_name: null,
    event_type: input.eventType,
    step: input.step,
    message: input.message,
    stream: input.stream ?? "system",
    metadata: input.metadata ?? {}
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
  const { data: run } = await admin.from("agent_runs").select("*").eq("id", runId).eq("owner_id", user.id).single();
  if (!run) {
    return NextResponse.json({ error: "Run not found" }, { status: 404 });
  }

  const cloneStartState = getCloneStartState(String(run.status), typeof run.current_step === "string" ? run.current_step : null);
  if (cloneStartState === "already_running" || cloneStartState === "finished") {
    return NextResponse.json({ status: cloneStartState, currentStep: run.current_step });
  }

  if (cloneStartState !== "claimable") {
    return NextResponse.json({ error: "Run is not queued for cloning." }, { status: 409 });
  }

  const { data: project } = await admin.from("projects").select("*").eq("id", run.project_id).eq("owner_id", user.id).single();
  const sourceProjectId = typeof project?.source_project_id === "string" ? project.source_project_id : null;
  if (!project || !sourceProjectId) {
    return NextResponse.json({ error: "Clone source project not found." }, { status: 409 });
  }

  const context = { ownerId: String(run.owner_id), projectId: String(run.project_id), runId: String(run.id) };
  const config = buildSandboxRuntimeConfig(process.env);

  try {
    const { data: claimedRun } = await admin
      .from("agent_runs")
      .update({ current_step: "creating_clone_sandbox", sandbox_status: "creating", updated_at: new Date().toISOString() })
      .eq("id", runId)
      .eq("owner_id", user.id)
      .eq("status", "running")
      .eq("current_step", "clone_queued")
      .select("id,current_step")
      .maybeSingle();

    if (!claimedRun) {
      const { data: latestRun } = await admin.from("agent_runs").select("status,current_step").eq("id", runId).eq("owner_id", user.id).single();
      return NextResponse.json({
        status: getCloneStartState(String(latestRun?.status ?? ""), typeof latestRun?.current_step === "string" ? latestRun.current_step : null),
        currentStep: latestRun?.current_step ?? null
      });
    }

    await admin.from("sandbox_runs").update({ status: "creating", updated_at: new Date().toISOString() }).eq("run_id", runId);
    await insertRunEvent(admin, { ...context, eventType: "project.clone.started", step: "creating_clone_sandbox", message: "开始创建克隆 Sandbox。" });

    const [{ data: sourceRuns }, { data: sourceSandboxRuns }] = await Promise.all([
      admin
      .from("agent_runs")
        .select("id,sandbox_name,created_at,updated_at")
      .eq("project_id", sourceProjectId)
      .not("sandbox_name", "is", null)
      .order("created_at", { ascending: false })
        .limit(10),
      admin
        .from("sandbox_runs")
        .select("sandbox_name,created_at,updated_at")
        .eq("project_id", sourceProjectId)
        .not("sandbox_name", "is", null)
        .order("updated_at", { ascending: false })
        .limit(10)
    ]);
    const sourceSandboxNames = getCloneSourceSandboxCandidates(sourceRuns ?? [], sourceSandboxRuns ?? []);
    if (!sourceSandboxNames.length) {
      throw new Error("源项目没有可复制的 Sandbox。");
    }

    const sandboxName = buildSandboxName({ ownerId: context.ownerId, projectId: context.projectId, runId: context.runId });
    let sandbox: Awaited<ReturnType<typeof getVercelSandbox>>;
    try {
      sandbox = await createVercelSandbox({ name: sandboxName, config });
    } catch (createError) {
      await insertRunEvent(admin, {
        ...context,
        eventType: "project.clone.sandbox.recovering",
        step: "creating_clone_sandbox",
        message: buildCloneStepFailureMessage("创建克隆 Sandbox 返回错误，正在尝试复用同名 Sandbox。", createError),
        metadata: { sandboxName }
      });

      sandbox = await getVercelSandbox(sandboxName).catch((lookupError) => {
        const createMessage = formatCloneWorkflowError(createError, "创建克隆 Sandbox 失败。");
        const lookupMessage = formatCloneWorkflowError(lookupError, "复用同名 Sandbox 失败。");
        throw new Error(`创建克隆 Sandbox 失败，且无法复用同名 Sandbox。\n创建错误：${createMessage}\n复用错误：${lookupMessage}`);
      });
    }
    let sourceSandbox: Awaited<ReturnType<typeof getVercelSandbox>> | null = null;
    const sourceSandboxErrors: string[] = [];
    for (const sourceSandboxName of sourceSandboxNames) {
      try {
        sourceSandbox = await getVercelSandbox(sourceSandboxName);
        break;
      } catch (error) {
        sourceSandboxErrors.push(`${sourceSandboxName}: ${formatCloneWorkflowError(error, "连接失败")}`);
      }
    }
    if (!sourceSandbox) {
      throw new Error(`连接源项目 Sandbox 失败，已尝试 ${sourceSandboxNames.length} 个候选。\n${sourceSandboxErrors.join("\n")}`);
    }
    const previewUrl = getSandboxPreviewUrl(sandbox, config.publishPort);
    const archivePath = `/tmp/smota-clone-${context.projectId}.tgz`;

    await insertRunEvent(admin, { ...context, eventType: "project.clone.archive.started", step: "archive_source_workspace", message: "正在打包源项目工作区。" });
    const archiveCommand = await sourceSandbox
      .runCommand({
        cmd: "bash",
        args: ["-lc", buildCloneWorkspaceArchiveCommand(archivePath)],
        cwd: WORKSPACE_DIR,
        timeoutMs: 10 * 60 * 1000
      })
      .catch((error) => {
        throw new Error(buildCloneStepFailureMessage("启动源项目工作区打包命令失败。", error));
      });
    const archiveFinished = await archiveCommand.wait().catch((error) => {
      throw new Error(buildCloneStepFailureMessage("等待源项目工作区打包命令失败。", error));
    });
    if (archiveFinished.exitCode !== 0) {
      throw new Error(buildCloneCommandFailureMessage("源项目工作区打包失败，请确认源项目 Sandbox 可恢复。", await commandOutput(archiveFinished)));
    }

    const archive = await sourceSandbox.readFileToBuffer({ path: archivePath }).catch((error) => {
      throw new Error(buildCloneStepFailureMessage("读取源项目工作区压缩包失败。", error));
    });
    if (!archive) {
      throw new Error("源项目工作区打包结果不可读取。");
    }

    await insertRunEvent(admin, { ...context, eventType: "project.clone.extract.started", step: "extract_clone_workspace", message: "正在写入克隆项目工作区。" });
    await sandbox.writeFiles([{ path: archivePath, content: archive }]).catch((error) => {
      throw new Error(buildCloneStepFailureMessage("写入克隆项目工作区压缩包失败。", error));
    });
    const extractCommand = await sandbox
      .runCommand({
        cmd: "bash",
        args: ["-lc", buildExtractCloneWorkspaceArchiveCommand(archivePath)],
        cwd: getCloneWorkspaceBootstrapCwd(),
        timeoutMs: 10 * 60 * 1000
      })
      .catch((error) => {
        throw new Error(buildCloneStepFailureMessage("启动克隆项目工作区解包命令失败。", error));
      });
    const extractFinished = await extractCommand.wait().catch((error) => {
      throw new Error(buildCloneStepFailureMessage("等待克隆项目工作区解包命令失败。", error));
    });
    if (extractFinished.exitCode !== 0) {
      throw new Error(buildCloneCommandFailureMessage("克隆项目工作区解包失败。", await commandOutput(extractFinished)));
    }

    await sandbox.writeFiles([{ path: `${WORKSPACE_DIR}/smota.vite.config.ts`, content: buildVitePreviewConfigContent() }]);
    await Promise.all([
      admin
        .from("agent_runs")
        .update({
          sandbox_name: sandboxName,
          sandbox_status: "installing",
          current_step: "installing_clone_dependencies",
          sandbox_runtime: config.runtime,
          sandbox_timeout_ms: config.timeoutMs,
          updated_at: new Date().toISOString()
        })
        .eq("id", runId),
      admin
        .from("sandbox_runs")
        .update({
          sandbox_name: sandboxName,
          status: "installing",
          runtime: config.runtime,
          timeout_ms: config.timeoutMs,
          publish_port: config.publishPort,
          updated_at: new Date().toISOString()
        })
        .eq("run_id", runId)
    ]);

    await insertRunEvent(admin, { ...context, eventType: "project.clone.preview.started", step: "start_clone_preview", message: "正在安装依赖并启动克隆预览。" });
    const previewFinished = await runSandboxCommand({
      supabase: admin,
      context,
      sandbox,
      step: "start_clone_preview",
      cmd: "bash",
      args: [
        "-lc",
        [
          "corepack enable >/dev/null 2>&1 || true",
          "pnpm install",
          `nohup pnpm ${quoteArgs(buildViteDevServerArgs(config.publishPort))} > .smota-preview-server.log 2>&1 &`
        ].join(" && ")
      ],
      cwd: WORKSPACE_DIR,
      timeoutMs: config.timeoutMs
    }).catch((error) => {
      throw new Error(buildCloneStepFailureMessage("启动克隆项目预览命令失败。", error));
    });
    if (previewFinished.exitCode !== 0) {
      throw new Error(buildCloneCommandFailureMessage("克隆项目预览启动失败。", await commandOutput(previewFinished)));
    }

    await scanWorkspaceFiles({ sandbox, supabase: admin, context, phase: "clone_workspace" });

    await Promise.all([
      admin
        .from("agent_runs")
        .update({
          status: "succeeded",
          current_step: "succeeded",
          sandbox_status: "previewing",
          sandbox_preview_url: previewUrl,
          build_status: "succeeded",
          updated_at: new Date().toISOString()
        })
        .eq("id", runId),
      admin
        .from("sandbox_runs")
        .update({
          status: "previewing",
          preview_url: previewUrl,
          last_error: null,
          updated_at: new Date().toISOString()
        })
        .eq("run_id", runId),
      admin.from("tasks").update({ status: "done", updated_at: new Date().toISOString() }).eq("run_id", runId).eq("owner_id", user.id)
    ]);

    await insertRunEvent(admin, {
      ...context,
      eventType: "project.clone.completed",
      step: "clone_completed",
      message: "克隆项目已复制完成并启动预览。",
      metadata: { previewUrl, sourceProjectId }
    });

    return NextResponse.json({ status: "succeeded", previewUrl });
  } catch (error) {
    const message = formatCloneWorkflowError(error, "克隆项目失败。");
    await Promise.all([
      admin.from("agent_runs").update({ status: "failed", current_step: "clone_failed", sandbox_status: "failed", build_error: message, updated_at: new Date().toISOString() }).eq("id", runId),
      admin.from("sandbox_runs").update({ status: "failed", last_error: message, updated_at: new Date().toISOString() }).eq("run_id", runId)
    ]);
    await insertRunEvent(admin, { ...context, eventType: "project.clone.failed", step: "clone_failed", message, stream: "stderr", metadata: { sourceProjectId } });
    return NextResponse.json({ status: "failed", reason: message }, { status: 500 });
  }
}
