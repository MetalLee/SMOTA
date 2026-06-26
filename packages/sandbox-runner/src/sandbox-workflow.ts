import type { SupabaseClient } from "@supabase/supabase-js";
import { buildSandboxName, buildSandboxRuntimeConfig, createSupabaseServiceClient, createVercelSandbox } from "./sandbox-client";
import { commandOutput, runSandboxCommand, startDetachedSandboxCommand } from "./sandbox-commands";
import { ensureWorkspace, scanWorkspaceFiles, writeHarnessArtifacts, WORKSPACE_DIR } from "./sandbox-files";
import { insertRunEvent, updateRunStatus, type RunContext } from "./sandbox-events";
import { getSandboxPreviewUrl } from "./sandbox-preview";
import { toSandboxEnvironment } from "./sandbox-security";

const HARNESS_PATHS = ["PROJECT_BRIEF.md", "ARCHITECTURE.md", "ROADMAP.md", "CODEX_TASK_RULES.md", "AGENTS.md"];

interface WorkflowOptions {
  supabase?: SupabaseClient;
  env?: Record<string, string | undefined>;
}

export function buildCodexPrompt(input: {
  projectPrompt: string;
  tasks: Array<{ title: string; description: string | null }>;
  artifacts: Array<{ path: string; content: string }>;
}) {
  const taskLines = input.tasks.map((task, index) => `${index + 1}. ${task.title}${task.description ? `\n   ${task.description}` : ""}`);
  const artifactSections = input.artifacts.map((artifact) => `## ${artifact.path}\n\n${artifact.content}`);

  return [
    "You are the CodingAgent for SMOTA.",
    "All generated application code must stay inside /workspace.",
    "Implement the approved MVP as a Vite React TypeScript application.",
    "Do not use a Local Runner and do not depend on generated-workspaces.",
    "",
    `Original user request: ${input.projectPrompt}`,
    "",
    "Approved tasks:",
    taskLines.join("\n"),
    "",
    "Harness artifacts:",
    artifactSections.join("\n\n---\n\n")
  ].join("\n");
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

export function buildCodexExecShellCommand(codexCommand: string, prompt: string): string {
  return `${codexCommand} exec --skip-git-repo-check ${shellQuote(prompt)}`;
}

export function buildGitSetupShellCommand(): string {
  return [
    "command -v git >/dev/null 2>&1 || sudo dnf install -y git",
    "cd /workspace",
    "git init -b main || git init"
  ].join(" && ");
}

async function upsertSandboxRun(
  supabase: SupabaseClient,
  context: RunContext,
  row: Record<string, unknown>
) {
  const { data: existing } = await supabase.from("sandbox_runs").select("id").eq("run_id", context.runId).eq("owner_id", context.ownerId).maybeSingle();
  if (existing?.id) {
    await supabase.from("sandbox_runs").update(row).eq("id", existing.id);
    return;
  }
  await supabase.from("sandbox_runs").insert(row);
}

export async function runVercelSandboxWorkflow(runId: string, options: WorkflowOptions = {}) {
  const supabase = options.supabase ?? createSupabaseServiceClient(options.env);
  const env = options.env ?? process.env;

  const { data: run, error: runError } = await supabase.from("agent_runs").select("*").eq("id", runId).single();
  if (runError || !run) {
    throw new Error(runError?.message ?? "Run not found.");
  }

  if (!["approved", "failed_retryable"].includes(String(run.status))) {
    throw new Error(`Run status must be approved or failed_retryable, got ${run.status}.`);
  }

  const { data: project } = await supabase
    .from("projects")
    .select("*")
    .eq("id", run.project_id)
    .eq("owner_id", run.owner_id)
    .single();

  if (!project) {
    throw new Error("Project not found for run owner.");
  }

  const context: RunContext = { ownerId: run.owner_id, projectId: run.project_id, runId: run.id };
  const config = buildSandboxRuntimeConfig(env);
  const sandboxName = buildSandboxName({ ownerId: run.owner_id, projectId: run.project_id, runId: run.id });

  try {
    await updateRunStatus(supabase, context, {
      status: "running",
      sandbox_name: sandboxName,
      sandbox_status: "creating",
      sandbox_runtime: config.runtime,
      sandbox_timeout_ms: config.timeoutMs,
      current_step: "creating_sandbox"
    });

    const sandbox = await createVercelSandbox({ name: sandboxName, config, env });
    await upsertSandboxRun(supabase, context,
      {
        owner_id: context.ownerId,
        project_id: context.projectId,
        run_id: context.runId,
        sandbox_name: sandboxName,
        status: "ready",
        runtime: config.runtime,
        timeout_ms: config.timeoutMs,
        publish_port: config.publishPort,
        updated_at: new Date().toISOString()
      }
    );
    await updateRunStatus(supabase, context, { sandbox_status: "ready", current_step: "sandbox_ready" });
    await insertRunEvent(supabase, context, {
      eventType: "sandbox.created",
      step: "create_sandbox",
      message: `Created Vercel Sandbox ${sandboxName}.`,
      payload: { sandboxName, runtime: config.runtime, publishPort: config.publishPort }
    });

    await ensureWorkspace(sandbox);

    const [{ data: artifacts }, { data: tasks }] = await Promise.all([
      supabase
        .from("artifacts")
        .select("path, content")
        .eq("run_id", run.id)
        .eq("owner_id", run.owner_id)
        .in("path", HARNESS_PATHS),
      supabase.from("tasks").select("title, description").eq("run_id", run.id).eq("owner_id", run.owner_id).order("sort_order")
    ]);

    const harnessArtifacts = HARNESS_PATHS.map((path) => {
      const artifact = artifacts?.find((item: { path: string }) => item.path === path);
      if (!artifact) {
        throw new Error(`Missing harness artifact ${path}.`);
      }
      return artifact;
    });

    await updateRunStatus(supabase, context, { current_step: "writing_harness", sandbox_status: "generating" });
    await writeHarnessArtifacts(sandbox, harnessArtifacts);

    await runSandboxCommand({
      supabase,
      context,
      sandbox,
      step: "init_vite",
      cmd: "bash",
      args: ["-lc", "tmpdir=$(mktemp -d) && cd \"$tmpdir\" && npm create vite@latest app -- --template react-ts && cp -a app/. /workspace && rm -rf \"$tmpdir\""],
      timeoutMs: 10 * 60 * 1000
    });

    await runSandboxCommand({
      supabase,
      context,
      sandbox,
      step: "setup_git",
      cmd: "bash",
      args: ["-lc", buildGitSetupShellCommand()],
      cwd: WORKSPACE_DIR,
      timeoutMs: 10 * 60 * 1000
    });

    if (env.CODEX_CLI_INSTALL_COMMAND) {
      await runSandboxCommand({
        supabase,
        context,
        sandbox,
        step: "install_codex_cli",
        cmd: "bash",
        args: ["-lc", env.CODEX_CLI_INSTALL_COMMAND],
        cwd: WORKSPACE_DIR,
        env: toSandboxEnvironment(env),
        timeoutMs: 15 * 60 * 1000
      });
    }

    const codexCommand = env.CODEX_CLI_COMMAND ?? "codex";
    const codexCheck = await runSandboxCommand({
      supabase,
      context,
      sandbox,
      step: "check_codex_cli",
      cmd: "bash",
      args: ["-lc", `${codexCommand} --version >/dev/null 2>&1`],
      cwd: WORKSPACE_DIR,
      env: toSandboxEnvironment(env),
      timeoutMs: 60 * 1000
    });

    if (codexCheck.exitCode !== 0) {
      const message = "Codex CLI not found in Vercel Sandbox. Please configure CODEX_CLI_INSTALL_COMMAND or CODEX_CLI_COMMAND.";
      await insertRunEvent(supabase, context, {
        eventType: "run.failed",
        step: "check_codex_cli",
        message,
        stream: "stderr"
      });
      await updateRunStatus(supabase, context, {
        status: "failed",
        sandbox_status: "failed",
        current_step: "codex_cli_missing",
        build_error: message
      });
      await supabase.from("sandbox_runs").update({ status: "failed", last_error: message }).eq("run_id", run.id);
      return { status: "failed", reason: message };
    }

    const taskPrompt = buildCodexPrompt({
      projectPrompt: project.prompt ?? run.user_prompt,
      tasks: tasks ?? [],
      artifacts: harnessArtifacts
    });

    await updateRunStatus(supabase, context, { current_step: "running_codex", sandbox_status: "generating" });
    const codexRun = await runSandboxCommand({
      supabase,
      context,
      sandbox,
      step: "codex_exec",
      cmd: "bash",
      args: ["-lc", buildCodexExecShellCommand(codexCommand, taskPrompt)],
      cwd: WORKSPACE_DIR,
      env: toSandboxEnvironment(env),
      timeoutMs: config.timeoutMs
    });
    if (codexRun.exitCode !== 0) {
      throw new Error(await commandOutput(codexRun));
    }

    await runSandboxCommand({ supabase, context, sandbox, step: "corepack", cmd: "corepack", args: ["enable"], cwd: WORKSPACE_DIR });
    await updateRunStatus(supabase, context, { current_step: "installing", sandbox_status: "installing" });
    await runSandboxCommand({ supabase, context, sandbox, step: "install", cmd: "pnpm", args: ["install"], cwd: WORKSPACE_DIR, timeoutMs: 20 * 60 * 1000 });

    await insertRunEvent(supabase, context, { eventType: "build.started", step: "build", message: "Running pnpm build." });
    await updateRunStatus(supabase, context, { current_step: "building", build_status: "running", sandbox_status: "building" });
    let build = await runSandboxCommand({ supabase, context, sandbox, step: "build", cmd: "pnpm", args: ["build"], cwd: WORKSPACE_DIR, timeoutMs: 20 * 60 * 1000 });

    if (build.exitCode !== 0) {
      const buildError = await commandOutput(build);
      await insertRunEvent(supabase, context, { eventType: "build.failed", step: "build", message: buildError, stream: "stderr" });

      if (!run.fix_attempted) {
        await insertRunEvent(supabase, context, { eventType: "fix.started", step: "fix", message: "Starting one automatic Codex repair attempt." });
        await updateRunStatus(supabase, context, { current_step: "fixing", fix_attempted: true, sandbox_status: "fixing", build_error: buildError });
        const fixPrompt = `${taskPrompt}\n\nThe build failed. Fix the application once. Build error:\n${buildError}`;
        await runSandboxCommand({
          supabase,
          context,
          sandbox,
          step: "codex_fix",
          cmd: "bash",
          args: ["-lc", buildCodexExecShellCommand(codexCommand, fixPrompt)],
          cwd: WORKSPACE_DIR,
          env: toSandboxEnvironment(env),
          timeoutMs: config.timeoutMs
        });
        await insertRunEvent(supabase, context, { eventType: "fix.finished", step: "fix", message: "Automatic repair attempt finished." });
        build = await runSandboxCommand({ supabase, context, sandbox, step: "build_retry", cmd: "pnpm", args: ["build"], cwd: WORKSPACE_DIR, timeoutMs: 20 * 60 * 1000 });
      }
    }

    if (build.exitCode !== 0) {
      const buildError = await commandOutput(build);
      await updateRunStatus(supabase, context, { status: "failed", build_status: "failed", build_error: buildError, sandbox_status: "failed", current_step: "build_failed" });
      await supabase.from("sandbox_runs").update({ status: "failed", last_error: buildError }).eq("run_id", run.id);
      await insertRunEvent(supabase, context, { eventType: "run.failed", step: "build", message: buildError, stream: "stderr" });
      return { status: "failed", reason: buildError };
    }

    await insertRunEvent(supabase, context, { eventType: "build.succeeded", step: "build", message: "pnpm build succeeded." });
    await updateRunStatus(supabase, context, { build_status: "succeeded", current_step: "indexing_files" });
    await scanWorkspaceFiles({ sandbox, supabase, context });

    await updateRunStatus(supabase, context, { current_step: "starting_preview", sandbox_status: "previewing" });
    await startDetachedSandboxCommand({
      supabase,
      context,
      sandbox,
      step: "dev_server",
      cmd: "pnpm",
      args: ["dev", "--host", "0.0.0.0", "--port", String(config.publishPort)],
      cwd: WORKSPACE_DIR,
      timeoutMs: config.timeoutMs
    });

    const previewUrl = getSandboxPreviewUrl(sandbox, config.publishPort);
    await updateRunStatus(supabase, context, { status: "succeeded", current_step: "succeeded", sandbox_preview_url: previewUrl, sandbox_status: "previewing" });
    await supabase.from("sandbox_runs").update({ status: "previewing", preview_url: previewUrl }).eq("run_id", run.id);
    await supabase.from("artifacts").insert({
      owner_id: context.ownerId,
      project_id: context.projectId,
      run_id: context.runId,
      type: "review_report",
      title: "Review Report",
      path: "REVIEW_REPORT.md",
      content: `# Review Report\n\nBuild succeeded.\n\nPreview: ${previewUrl}\n`
    });
    await insertRunEvent(supabase, context, { eventType: "artifact.created", step: "review_report", message: "Created Review Report artifact." });
    await insertRunEvent(supabase, context, { eventType: "preview.ready", step: "preview", message: `Preview is ready: ${previewUrl}`, payload: { previewUrl } });
    await insertRunEvent(supabase, context, { eventType: "run.status", step: "succeeded", message: "Run succeeded." });

    return { status: "succeeded", previewUrl };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Sandbox workflow failed.";
    await updateRunStatus(supabase, context, { status: "failed", sandbox_status: "failed", current_step: "failed", build_error: message });
    await supabase.from("sandbox_runs").update({ status: "failed", last_error: message }).eq("run_id", run.id);
    await insertRunEvent(supabase, context, { eventType: "run.failed", step: "failed", message, stream: "stderr" });
    return { status: "failed", reason: message };
  }
}
