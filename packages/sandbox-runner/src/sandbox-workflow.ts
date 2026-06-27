import type { SupabaseClient } from "@supabase/supabase-js";
import { createReviewerAgent, fallbackReviewReport } from "@smota/agent-core";
import { buildSandboxName, buildSandboxRuntimeConfig, createSupabaseServiceClient, createVercelSandbox } from "./sandbox-client";
import { commandOutput, runSandboxCommand, startDetachedSandboxCommand } from "./sandbox-commands";
import { ensureWorkspace, scanWorkspaceFiles, writeHarnessArtifacts, WORKSPACE_DIR } from "./sandbox-files";
import { insertRunEvent, updateRunStatus, type RunContext } from "./sandbox-events";
import { getSandboxPreviewUrl } from "./sandbox-preview";
import {
  buildPreviewScreenshotObjectPath,
  buildSandboxPreviewScreenshotCommand,
  getSandboxPreviewScreenshotPath,
  getPreviewScreenshotBucket,
  getPreviewScreenshotConfig,
  shouldCapturePreviewScreenshot,
  uploadPreviewScreenshot
} from "./sandbox-screenshot";
import { DEEPSEEK_OPENAI_BASE_URL, DEEPSEEK_V4_PRO_MODEL, OPENCODE_DEEPSEEK_V4_PRO_MODEL, buildSandboxCodingAgentEnvironment } from "./sandbox-security";

const HARNESS_PATHS = ["PROJECT_BRIEF.md", "ARCHITECTURE.md", "ROADMAP.md", "CODEX_TASK_RULES.md", "AGENTS.md"];

interface WorkflowOptions {
  supabase?: SupabaseClient;
  env?: Record<string, string | undefined>;
}

export function buildCodingAgentPrompt(input: {
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

export function buildOpenCodeModel(env: Record<string, string | undefined> = process.env): string {
  if (env.OPENCODE_MODEL) {
    return env.OPENCODE_MODEL;
  }
  const model = env.OPENAI_MODEL || DEEPSEEK_V4_PRO_MODEL;
  return model.includes("/") ? model : `deepseek/${model}`;
}

export function buildOpenCodeConfig(input: { model: string; baseUrl?: string }): string {
  return JSON.stringify(
    {
      $schema: "https://opencode.ai/config.json",
      model: input.model,
      small_model: input.model,
      share: "disabled",
      autoupdate: false,
      provider: {
        deepseek: {
          options: {
            apiKey: "{env:DEEPSEEK_API_KEY}",
            baseURL: input.baseUrl ?? DEEPSEEK_OPENAI_BASE_URL
          }
        }
      }
    },
    null,
    2
  );
}

export function buildOpenCodeRunShellCommand(opencodeCommand: string, model: string, prompt: string): string {
  return `${opencodeCommand} run --model ${model} --agent build --dangerously-skip-permissions ${shellQuote(prompt)}`;
}

export function buildGitSetupShellCommand(): string {
  return [
    "command -v git >/dev/null 2>&1 || sudo dnf install -y git",
    "cd /workspace",
    "git init -b main || git init"
  ].join(" && ");
}

export function buildVitePreviewConfigContent(): string {
  return `import { defineConfig, mergeConfig, type UserConfig } from 'vite';
import userConfig from './vite.config';

export default defineConfig(async (env) => {
  const base = typeof userConfig === 'function' ? await userConfig(env) : await userConfig;

  return mergeConfig(base as UserConfig, {
    server: {
      host: '0.0.0.0',
      allowedHosts: true
    },
    preview: {
      host: '0.0.0.0',
      allowedHosts: true
    }
  });
});
`;
}

export function buildViteDevServerArgs(port: number): string[] {
  return ["dev", "--config", "smota.vite.config.ts", "--host", "0.0.0.0", "--port", String(port), "--strictPort"];
}

export function buildRealtimeSandboxPhasePlan() {
  return {
    fileScanPhases: ["harness_written", "init_vite", "preview_ready", "opencode_run", "install_after_opencode", "build"],
    previewStartsBeforeOpenCode: true,
    screenshotPhase: "after_build"
  };
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
  const codingAgentEnv = buildSandboxCodingAgentEnvironment(env);
  const opencodeCommand = env.OPENCODE_CLI_COMMAND ?? "opencode";
  const opencodeModel = buildOpenCodeModel(env);
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
    await scanWorkspaceFiles({ sandbox, supabase, context, phase: "harness_written" });

    await runSandboxCommand({
      supabase,
      context,
      sandbox,
      step: "init_vite",
      cmd: "bash",
      args: ["-lc", "tmpdir=$(mktemp -d) && cd \"$tmpdir\" && npm create vite@latest app -- --template react-ts && cp -a app/. /workspace && rm -rf \"$tmpdir\""],
      timeoutMs: 10 * 60 * 1000
    });
    await scanWorkspaceFiles({ sandbox, supabase, context, phase: "init_vite" });

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

    await runSandboxCommand({ supabase, context, sandbox, step: "corepack", cmd: "corepack", args: ["enable"], cwd: WORKSPACE_DIR });
    await updateRunStatus(supabase, context, { current_step: "installing_initial", sandbox_status: "installing" });
    await runSandboxCommand({ supabase, context, sandbox, step: "install_initial", cmd: "pnpm", args: ["install"], cwd: WORKSPACE_DIR, timeoutMs: 20 * 60 * 1000 });

    await sandbox.writeFiles([
      {
        path: `${WORKSPACE_DIR}/smota.vite.config.ts`,
        content: buildVitePreviewConfigContent()
      }
    ]);

    await updateRunStatus(supabase, context, { current_step: "starting_preview", sandbox_status: "previewing" });
    await startDetachedSandboxCommand({
      supabase,
      context,
      sandbox,
      step: "dev_server",
      cmd: "pnpm",
      args: buildViteDevServerArgs(config.publishPort),
      cwd: WORKSPACE_DIR,
      timeoutMs: config.timeoutMs
    });

    const previewUrl = getSandboxPreviewUrl(sandbox, config.publishPort);
    await updateRunStatus(supabase, context, { current_step: "preview_ready", sandbox_preview_url: previewUrl, sandbox_status: "previewing" });
    await supabase.from("sandbox_runs").update({ status: "previewing", preview_url: previewUrl }).eq("run_id", run.id);
    await scanWorkspaceFiles({ sandbox, supabase, context, phase: "preview_ready" });
    await insertRunEvent(supabase, context, { eventType: "preview.ready", step: "preview", message: `Preview is ready: ${previewUrl}`, payload: { previewUrl, phase: "default_vite_home" } });

    if (env.OPENCODE_CLI_INSTALL_COMMAND) {
      await runSandboxCommand({
        supabase,
        context,
        sandbox,
        step: "install_opencode_cli",
        cmd: "bash",
        args: ["-lc", env.OPENCODE_CLI_INSTALL_COMMAND],
        cwd: WORKSPACE_DIR,
        env: codingAgentEnv,
        timeoutMs: 15 * 60 * 1000
      });
    }

    const opencodeCheck = await runSandboxCommand({
      supabase,
      context,
      sandbox,
      step: "check_opencode_cli",
      cmd: "bash",
      args: ["-lc", `${opencodeCommand} --version >/dev/null 2>&1`],
      cwd: WORKSPACE_DIR,
      env: codingAgentEnv,
      timeoutMs: 60 * 1000
    });

    if (opencodeCheck.exitCode !== 0) {
      const message = "OpenCode CLI not found in Vercel Sandbox. Please configure OPENCODE_CLI_INSTALL_COMMAND or OPENCODE_CLI_COMMAND.";
      await insertRunEvent(supabase, context, {
        eventType: "run.failed",
        step: "check_opencode_cli",
        message,
        stream: "stderr"
      });
      await updateRunStatus(supabase, context, {
        status: "failed",
        sandbox_status: "failed",
        current_step: "opencode_cli_missing",
        build_error: message
      });
      await supabase.from("sandbox_runs").update({ status: "failed", last_error: message }).eq("run_id", run.id);
      return { status: "failed", reason: message };
    }

    await sandbox.writeFiles([
      {
        path: `${WORKSPACE_DIR}/opencode.json`,
        content: buildOpenCodeConfig({ model: opencodeModel, baseUrl: env.OPENAI_BASE_URL || DEEPSEEK_OPENAI_BASE_URL })
      }
    ]);

    const taskPrompt = buildCodingAgentPrompt({
      projectPrompt: project.prompt ?? run.user_prompt,
      tasks: tasks ?? [],
      artifacts: harnessArtifacts
    });

    await updateRunStatus(supabase, context, { current_step: "running_opencode", sandbox_status: "generating" });
    const opencodeRun = await runSandboxCommand({
      supabase,
      context,
      sandbox,
      step: "opencode_run",
      cmd: "bash",
      args: ["-lc", buildOpenCodeRunShellCommand(opencodeCommand, opencodeModel, taskPrompt)],
      cwd: WORKSPACE_DIR,
      env: codingAgentEnv,
      timeoutMs: config.timeoutMs
    });
    if (opencodeRun.exitCode !== 0) {
      throw new Error(await commandOutput(opencodeRun));
    }
    await scanWorkspaceFiles({ sandbox, supabase, context, phase: "opencode_run" });

    await updateRunStatus(supabase, context, { current_step: "installing_after_opencode", sandbox_status: "installing" });
    await runSandboxCommand({ supabase, context, sandbox, step: "install_after_opencode", cmd: "pnpm", args: ["install"], cwd: WORKSPACE_DIR, timeoutMs: 20 * 60 * 1000 });
    await scanWorkspaceFiles({ sandbox, supabase, context, phase: "install_after_opencode" });

    await insertRunEvent(supabase, context, { eventType: "build.started", step: "build", message: "Running pnpm build." });
    await updateRunStatus(supabase, context, { current_step: "building", build_status: "running", sandbox_status: "building" });
    let build = await runSandboxCommand({ supabase, context, sandbox, step: "build", cmd: "pnpm", args: ["build"], cwd: WORKSPACE_DIR, timeoutMs: 20 * 60 * 1000 });

    if (build.exitCode !== 0) {
      const buildError = await commandOutput(build);
      await insertRunEvent(supabase, context, { eventType: "build.failed", step: "build", message: buildError, stream: "stderr" });

      if (!run.fix_attempted) {
        await insertRunEvent(supabase, context, { eventType: "fix.started", step: "fix", message: "Starting one automatic OpenCode repair attempt." });
        await updateRunStatus(supabase, context, { current_step: "fixing", fix_attempted: true, sandbox_status: "fixing", build_error: buildError });
        const fixPrompt = `${taskPrompt}\n\nThe build failed. Fix the application once. Build error:\n${buildError}`;
        await runSandboxCommand({
          supabase,
          context,
          sandbox,
          step: "opencode_fix",
          cmd: "bash",
          args: ["-lc", buildOpenCodeRunShellCommand(opencodeCommand, opencodeModel, fixPrompt)],
          cwd: WORKSPACE_DIR,
          env: codingAgentEnv,
          timeoutMs: config.timeoutMs
        });
        await scanWorkspaceFiles({ sandbox, supabase, context, phase: "fix" });
        await insertRunEvent(supabase, context, { eventType: "fix.finished", step: "fix", message: "Automatic repair attempt finished." });
        await runSandboxCommand({ supabase, context, sandbox, step: "install_after_fix", cmd: "pnpm", args: ["install"], cwd: WORKSPACE_DIR, timeoutMs: 20 * 60 * 1000 });
        await scanWorkspaceFiles({ sandbox, supabase, context, phase: "install_after_fix" });
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
    await scanWorkspaceFiles({ sandbox, supabase, context, phase: "build" });

    await updateRunStatus(supabase, context, { status: "succeeded", current_step: "succeeded", sandbox_preview_url: previewUrl, sandbox_status: "previewing" });
    await supabase.from("sandbox_runs").update({ status: "previewing", preview_url: previewUrl }).eq("run_id", run.id);
    const screenshotBucket = getPreviewScreenshotBucket(env);
    let previewImageUrl: string | null = null;

    if (shouldCapturePreviewScreenshot({ bucket: screenshotBucket, previewUrl })) {
      try {
        await insertRunEvent(supabase, context, { eventType: "review.screenshot.started", step: "review_screenshot", message: "Capturing preview screenshot for project card." });
        const screenshotConfig = getPreviewScreenshotConfig(env);
        const screenshotPath = getSandboxPreviewScreenshotPath();
        const screenshotCommand = await runSandboxCommand({
          supabase,
          context,
          sandbox,
          step: "review_screenshot",
          cmd: "bash",
          args: ["-lc", buildSandboxPreviewScreenshotCommand({ previewUrl, config: screenshotConfig, outputPath: screenshotPath })],
          cwd: WORKSPACE_DIR,
          timeoutMs: screenshotConfig.timeoutMs + screenshotConfig.settleMs + 5 * 60 * 1000
        });
        if (screenshotCommand.exitCode !== 0) {
          throw new Error(await commandOutput(screenshotCommand));
        }
        const screenshot = await sandbox.readFileToBuffer({ path: screenshotPath });
        if (!screenshot) {
          throw new Error(`Sandbox screenshot was not written to ${screenshotPath}.`);
        }
        const objectPath = buildPreviewScreenshotObjectPath(context);
        previewImageUrl = await uploadPreviewScreenshot({
          supabase,
          bucket: screenshotBucket,
          objectPath,
          image: screenshot
        });
        await supabase.from("sandbox_runs").update({ preview_image_url: previewImageUrl }).eq("run_id", run.id);
        await insertRunEvent(supabase, context, {
          eventType: "review.screenshot.saved",
          step: "review_screenshot",
          message: "Saved preview screenshot to Supabase Storage.",
          payload: { bucket: screenshotBucket, objectPath, previewImageUrl }
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to capture preview screenshot.";
        await insertRunEvent(supabase, context, {
          eventType: "review.screenshot.failed",
          step: "review_screenshot",
          message,
          stream: "stderr",
          payload: { bucket: screenshotBucket }
        });
      }
    }
    const [{ data: reviewEvents }, { data: reviewFiles }] = await Promise.all([
      supabase
        .from("run_events")
        .select("event_type, message")
        .eq("run_id", run.id)
        .eq("owner_id", run.owner_id)
        .order("created_at", { ascending: true })
        .limit(80),
      supabase
        .from("workspace_files")
        .select("path, change_type")
        .eq("run_id", run.id)
        .eq("owner_id", run.owner_id)
        .order("path", { ascending: true })
        .limit(200)
    ]);
    let reviewReport = fallbackReviewReport("Build succeeded.", previewUrl);

    try {
      const reasoningWrites: Array<Promise<void>> = [];
      reviewReport = await createReviewerAgent().generateReport({
        buildResult: `Build succeeded.\nPreview: ${previewUrl}`,
        runEvents: (reviewEvents ?? []).map((event: { event_type: string; message: string | null }) => ({
          eventType: event.event_type,
          message: event.message
        })),
        files: (reviewFiles ?? []).map((file: { path: string; change_type: string | null }) => ({
          path: file.path,
          changeType: file.change_type
        })),
        knownIssues: [],
        previewUrl,
        onReasoning: (delta) => {
          const message = delta.trim();
          if (message) {
            reasoningWrites.push(
              insertRunEvent(supabase, context, {
                eventType: "agent.reasoning",
                agentName: "ReviewerAgent",
                step: "review_report",
                message
              })
            );
          }
        }
      });
      await Promise.all(reasoningWrites);
    } catch (error) {
      const message = error instanceof Error ? error.message : "ReviewerAgent LLM report failed.";
      await insertRunEvent(supabase, context, {
        eventType: "review.llm.failed",
        agentName: "ReviewerAgent",
        step: "review_report",
        message,
        stream: "stderr"
      });
      reviewReport = fallbackReviewReport(`Build succeeded.\nReviewerAgent LLM failed: ${message}`, previewUrl);
    }

    await supabase.from("artifacts").insert({
      owner_id: context.ownerId,
      project_id: context.projectId,
      run_id: context.runId,
      type: "review_report",
      title: "Review Report",
      path: "REVIEW_REPORT.md",
      content: previewImageUrl ? `${reviewReport}\n\nPreview screenshot: ${previewImageUrl}\n` : reviewReport
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
