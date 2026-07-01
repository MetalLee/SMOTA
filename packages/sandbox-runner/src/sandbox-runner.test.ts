import { describe, expect, it } from "vitest";
import {
  buildCodingAgentPrompt,
  buildContinuationCodingAgentPrompt,
  buildGitSetupShellCommand,
  markAgentTasksDone,
  buildOpenCodeConfig,
  buildOpenCodeRunShellCommand,
  buildPreviewServerEnsureShellCommand,
  buildRealtimeSandboxPhasePlan,
  buildSandboxWorkflowLease,
  getNextSandboxWorkflowPhase,
  getSandboxWorkflowPhasePlan,
  buildViteDevServerArgs,
  buildVitePreviewConfigContent,
  ensureSandboxPreviewServer,
  buildSandboxCodingAgentEnvironment,
  buildSandboxName,
  buildSandboxRuntimeConfig,
  getSandboxWorkflowStartState,
  getVercelSandboxToken,
  isSandboxWorkflowLeaseExpired,
  isVercelSandboxNotFoundError,
  isProbablyBinary,
  scanWorkspaceFiles,
  shouldDispatchSandboxWorkflowJob,
  shouldContinueSandboxWorkflow,
  shouldRunSandboxWorkflowPhase,
  sanitizeWorkspacePath,
  toSandboxEnvironment
} from "./index";

describe("sandbox runner helpers", () => {
  it("builds stable short Vercel Sandbox names", () => {
    expect(
      buildSandboxName({
        ownerId: "11111111-2222-3333-4444-555555555555",
        projectId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
        runId: "99999999-8888-7777-6666-555555555555"
      })
    ).toBe("smota-11111111-aaaaaaaa-99999999");
  });

  it("defaults sandbox runtime config from environment-shaped input", () => {
    expect(buildSandboxRuntimeConfig({})).toEqual({
      runtime: "node24",
      timeoutMs: 2700000,
      publishPort: 5173
    });
  });

  it("classifies Sandbox workflow starts for idempotent async dispatch", () => {
    expect(getSandboxWorkflowStartState("approved", "approved_waiting_for_sandbox")).toBe("claimable");
    expect(getSandboxWorkflowStartState("failed_retryable", "build_failed")).toBe("claimable");
    expect(getSandboxWorkflowStartState("running", "sandbox_start_queued")).toBe("already_running");
    expect(getSandboxWorkflowStartState("running", "building")).toBe("already_running");
    expect(getSandboxWorkflowStartState("succeeded", "succeeded")).toBe("finished");
    expect(getSandboxWorkflowStartState("failed", "failed")).toBe("finished");
    expect(getSandboxWorkflowStartState("planning", "planning_queued")).toBe("invalid");
  });

  it("expires Sandbox workflow leases only after their deadline", () => {
    expect(isSandboxWorkflowLeaseExpired(null, new Date("2026-06-30T12:00:00.000Z"))).toBe(true);
    expect(isSandboxWorkflowLeaseExpired("2026-06-30T11:59:59.999Z", new Date("2026-06-30T12:00:00.000Z"))).toBe(true);
    expect(isSandboxWorkflowLeaseExpired("2026-06-30T12:00:00.001Z", new Date("2026-06-30T12:00:00.000Z"))).toBe(false);
  });

  it("builds a Sandbox workflow lease from the worker clock", () => {
    expect(
      buildSandboxWorkflowLease({
        workerId: "worker-a",
        now: new Date("2026-06-30T12:00:00.000Z"),
        leaseMs: 90_000
      })
    ).toEqual({
      lease_owner: "worker-a",
      lease_expires_at: "2026-06-30T12:01:30.000Z"
    });
  });

  it("dispatches queued and expired Sandbox workflow jobs only", () => {
    const now = new Date("2026-06-30T12:00:00.000Z");

    expect(shouldDispatchSandboxWorkflowJob({ status: "queued", lease_expires_at: null }, now)).toBe(true);
    expect(shouldDispatchSandboxWorkflowJob({ status: "running", lease_expires_at: "2026-06-30T11:59:59.000Z" }, now)).toBe(true);
    expect(shouldDispatchSandboxWorkflowJob({ status: "running", lease_expires_at: "2026-06-30T12:01:00.000Z" }, now)).toBe(false);
    expect(shouldDispatchSandboxWorkflowJob({ status: "succeeded", lease_expires_at: null }, now)).toBe(false);
    expect(shouldDispatchSandboxWorkflowJob({ status: "failed", lease_expires_at: null }, now)).toBe(false);
  });

  it("orders Sandbox workflow phases for resumable worker invocations", () => {
    expect(getSandboxWorkflowPhasePlan()).toEqual([
      "prepare_sandbox",
      "write_harness",
      "init_base_app",
      "start_preview",
      "run_coding_agent",
      "install_and_build",
      "review_and_complete"
    ]);

    expect(getNextSandboxWorkflowPhase(null)).toBe("prepare_sandbox");
    expect(getNextSandboxWorkflowPhase("prepare_sandbox")).toBe("write_harness");
    expect(getNextSandboxWorkflowPhase("review_and_complete")).toBe(null);
    expect(getNextSandboxWorkflowPhase("unknown")).toBe("prepare_sandbox");
  });

  it("skips phases already reflected in persisted run state", () => {
    expect(
      shouldRunSandboxWorkflowPhase("prepare_sandbox", {
        sandboxName: "smota-run",
        currentStep: "sandbox_ready",
        runStatus: "running",
        buildStatus: null
      })
    ).toBe(false);

    expect(
      shouldRunSandboxWorkflowPhase("run_coding_agent", {
        sandboxName: "smota-run",
        currentStep: "installing_after_opencode",
        runStatus: "running",
        buildStatus: null
      })
    ).toBe(false);

    expect(
      shouldRunSandboxWorkflowPhase("install_and_build", {
        sandboxName: "smota-run",
        currentStep: "building",
        runStatus: "running",
        buildStatus: "running"
      })
    ).toBe(true);

    expect(
      shouldRunSandboxWorkflowPhase("review_and_complete", {
        sandboxName: "smota-run",
        currentStep: "succeeded",
        runStatus: "succeeded",
        buildStatus: "succeeded"
      })
    ).toBe(false);
  });

  it("continues Sandbox workflow after intermediate phases only", () => {
    expect(shouldContinueSandboxWorkflow({ phase: "prepare_sandbox", resultStatus: "phase_completed" })).toBe(true);
    expect(shouldContinueSandboxWorkflow({ phase: "review_and_complete", resultStatus: "succeeded" })).toBe(false);
    expect(shouldContinueSandboxWorkflow({ phase: "install_and_build", resultStatus: "failed" })).toBe(false);
  });

  it("resolves Vercel Sandbox tokens from Sandbox token, OIDC token, then Vercel token", () => {
    expect(
      getVercelSandboxToken({
        VERCEL_SANDBOX_API_TOKEN: "sandbox-token",
        VERCEL_OIDC_TOKEN: "oidc-token",
        VERCEL_TOKEN: "vercel-token"
      })
    ).toBe("sandbox-token");
    expect(getVercelSandboxToken({ VERCEL_OIDC_TOKEN: "oidc-token", VERCEL_TOKEN: "vercel-token" })).toBe("oidc-token");
    expect(getVercelSandboxToken({ VERCEL_TOKEN: "vercel-token" })).toBe("vercel-token");
  });

  it("keeps Supabase service role keys out of Sandbox environment", () => {
    expect(
      toSandboxEnvironment({
        CODEX_API_KEY: "codex-secret",
        DEEPSEEK_API_KEY: "deepseek-secret",
        OPENAI_API_KEY: "openai-secret",
        OPENAI_BASE_URL: "https://models.example.test",
        OPENAI_MODEL: "gpt-test",
        SUPABASE_SERVICE_ROLE_KEY: "must-not-leak",
        NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co"
      })
    ).toEqual({
      DEEPSEEK_API_KEY: "deepseek-secret",
      OPENAI_API_KEY: "openai-secret",
      OPENAI_BASE_URL: "https://models.example.test",
      OPENAI_MODEL: "gpt-test"
    });
  });

  it("defaults OpenCode in Sandbox to DeepSeek v4 Pro while preserving secret boundaries", () => {
    expect(
      buildSandboxCodingAgentEnvironment({
        DEEPSEEK_API_KEY: "deepseek-key",
        SUPABASE_SERVICE_ROLE_KEY: "must-not-leak",
        SMOTA_TASK_UPDATE_URL: "https://smota.example/api/runs/run-1",
        SMOTA_TASK_UPDATE_TOKEN: "task-token"
      })
    ).toEqual({
      OPENAI_API_KEY: "deepseek-key",
      OPENAI_BASE_URL: "https://api.deepseek.com",
      OPENAI_MODEL: "deepseek-v4-pro",
      DEEPSEEK_API_KEY: "deepseek-key",
      SMOTA_TASK_UPDATE_URL: "https://smota.example/api/runs/run-1",
      SMOTA_TASK_UPDATE_TOKEN: "task-token"
    });
  });

  it("builds an OpenCode config for the configured DeepSeek v4 Pro model", () => {
    expect(JSON.parse(buildOpenCodeConfig({ model: "deepseek/deepseek-v4-pro" }))).toEqual({
      $schema: "https://opencode.ai/config.json",
      model: "deepseek/deepseek-v4-pro",
      small_model: "deepseek/deepseek-v4-pro",
      share: "disabled",
      autoupdate: false,
      provider: {
        deepseek: {
          options: {
            apiKey: "{env:DEEPSEEK_API_KEY}",
            baseURL: "https://api.deepseek.com"
          }
        }
      }
    });
  });

  it("rejects workspace paths that escape /workspace", () => {
    expect(() => sanitizeWorkspacePath("../secrets.env")).toThrow(/Invalid workspace path/);
    expect(() => sanitizeWorkspacePath("src/../../secrets.env")).toThrow(/Invalid workspace path/);
    expect(sanitizeWorkspacePath("/src/App.tsx")).toBe("src/App.tsx");
  });

  it("detects binary file content before returning editor text", () => {
    expect(isProbablyBinary(Buffer.from("hello\nworld"))).toBe(false);
    expect(isProbablyBinary(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00]))).toBe(true);
  });

  it("builds a CodingAgent prompt from tasks and harness artifacts", () => {
    const prompt = buildCodingAgentPrompt({
      projectPrompt: "Build a booking dashboard",
      tasks: [
        { id: "task-shell", title: "Create shell", description: "Add the primary layout", status: "todo", agentName: "CodingAgent" },
        { id: "task-state", title: "Wire state", description: null, status: "todo", agentName: "CodingAgent" },
        { id: "task-build", title: "Run production build", description: "BuildAgent validates output", status: "todo", agentName: "BuildAgent" }
      ],
      artifacts: [
        { path: "PROJECT_BRIEF.md", content: "# Brief\nUse Vite." },
        { path: "ARCHITECTURE.md", content: "# Architecture\nRoot Vite app." },
        { path: "CODEX_TASK_RULES.md", content: "# Rules\nUse /workspace." },
        { path: "ROADMAP.md", content: "# Roadmap\nNoisy plan." },
        { path: "AGENTS.md", content: "# Agents\nUse CodingAgent." }
      ],
      taskUpdateUrl: "https://smota.example/api/runs/run-1",
      taskUpdateTokenEnvName: "SMOTA_TASK_UPDATE_TOKEN"
    });

    expect(prompt).toContain("Build a booking dashboard");
    expect(prompt).toContain("Create shell");
    expect(prompt).toContain("Task ID: task-shell");
    expect(prompt).not.toContain("Run production build");
    expect(prompt).not.toContain("Task ID: task-build");
    expect(prompt).toContain("Approved tasks are the only task list");
    expect(prompt).toContain("Every CodingAgent task that you finish must be marked done through the HTTP API before your final response.");
    expect(prompt).toContain("Do not update BuildAgent, ReviewerAgent, ProductAgent, ArchitectAgent, or PlannerAgent tasks.");
    expect(prompt).toContain("curl -fsS -X POST");
    expect(prompt).toContain("https://smota.example/api/runs/run-1/tasks/<taskId>/status");
    expect(prompt).toContain("SMOTA_TASK_UPDATE_TOKEN");
    expect(prompt).toContain("PROJECT_BRIEF.md");
    expect(prompt).toContain("ARCHITECTURE.md");
    expect(prompt).toContain("CODEX_TASK_RULES.md");
    expect(prompt).not.toContain("ROADMAP.md");
    expect(prompt).not.toContain("# Roadmap");
    expect(prompt).not.toContain("AGENTS.md");
    expect(prompt).not.toContain("# Agents");
    expect(prompt).toContain("All generated application code must stay inside /workspace.");
    expect(prompt).toContain("Treat /workspace as the Vite project root");
    expect(prompt).toContain("Do not create a nested app root");
    expect(prompt).toContain("简体中文");
  });

  it("recognizes missing Vercel Sandbox errors", () => {
    expect(isVercelSandboxNotFoundError(Object.assign(new Error("not_found"), { code: "not_found" }))).toBe(true);
    expect(isVercelSandboxNotFoundError(Object.assign(new Error("Status code 404 is not ok"), { status: 404 }))).toBe(true);
    expect(isVercelSandboxNotFoundError(new Error("quota exceeded"))).toBe(false);
  });

  it("builds a continuation CodingAgent prompt for cloned workspaces", () => {
    const prompt = buildContinuationCodingAgentPrompt({
      originalProjectPrompt: "克隆来的销售看板",
      changePrompt: "增加负责人筛选器",
      sourceKind: "cloned_workspace",
      tasks: [
        { id: "task-filter", title: "实现筛选器", description: "保持现有风格", status: "todo", agentName: "CodingAgent" },
        { id: "task-review", title: "生成质量报告", description: "ReviewerAgent 总结结果", status: "todo", agentName: "ReviewerAgent" }
      ],
      artifacts: [
        { path: "PROJECT_BRIEF.md", content: "# 项目简介\n增量目标" },
        { path: "ARCHITECTURE.md", content: "# 架构\n已有根目录" },
        { path: "CODEX_TASK_RULES.md", content: "# 规则\n不要重建" },
        { path: "ROADMAP.md", content: "# 路线图\n增量修改" },
        { path: "AGENTS.md", content: "# AGENTS\nCodingAgent" }
      ],
      workspaceFiles: ["package.json", "src/App.tsx"],
      taskUpdateUrl: "https://smota.example/api/runs/run-2",
      taskUpdateTokenEnvName: "SMOTA_TASK_UPDATE_TOKEN"
    });

    expect(prompt).toContain("当前 /workspace 已经存在项目文件");
    expect(prompt).toContain("克隆来的已有应用");
    expect(prompt).toContain("增加负责人筛选器");
    expect(prompt).toContain("Task ID: task-filter");
    expect(prompt).not.toContain("生成质量报告");
    expect(prompt).not.toContain("Task ID: task-review");
    expect(prompt).toContain("Approved tasks are the only task list");
    expect(prompt).toContain("Every CodingAgent task that you finish must be marked done through the HTTP API before your final response.");
    expect(prompt).toContain("Do not update BuildAgent, ReviewerAgent, ProductAgent, ArchitectAgent, or PlannerAgent tasks.");
    expect(prompt).toContain("不要重新初始化、重建或覆盖整个项目");
    expect(prompt).toContain("src/App.tsx");
    expect(prompt).toContain("PROJECT_BRIEF.md");
    expect(prompt).toContain("ARCHITECTURE.md");
    expect(prompt).toContain("CODEX_TASK_RULES.md");
    expect(prompt).not.toContain("ROADMAP.md");
    expect(prompt).not.toContain("AGENTS.md");
  });

  it("builds OpenCode run commands for the DeepSeek v4 Pro build agent", () => {
    expect(buildOpenCodeRunShellCommand("opencode", "deepseek/deepseek-v4-pro", "hello")).toBe(
      "opencode run --model deepseek/deepseek-v4-pro --agent build --dangerously-skip-permissions 'hello'"
    );
  });

  it("marks all tasks assigned to an agent done as a platform fallback", async () => {
    const calls: Array<{ table: string; action: string; value?: unknown; column?: string; match?: unknown }> = [];
    const makeBuilder = (table: string) => ({
      update(value: unknown) {
        calls.push({ table, action: "update", value });
        return this;
      },
      insert(value: unknown) {
        calls.push({ table, action: "insert", value });
        return Promise.resolve({ error: null });
      },
      eq(column: string, match: unknown) {
        calls.push({ table, action: "eq", column, match });
        return this;
      },
      neq(column: string, match: unknown) {
        calls.push({ table, action: "neq", column, match });
        return Promise.resolve({ error: null });
      }
    });
    const supabase = {
      from(table: string) {
        return makeBuilder(table);
      }
    };

    await markAgentTasksDone(
      supabase as never,
      { ownerId: "owner-1", projectId: "project-1", runId: "run-1" },
      "BuildAgent"
    );

    expect(calls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ table: "tasks", action: "update", value: expect.objectContaining({ status: "done" }) }),
        { table: "tasks", action: "eq", column: "run_id", match: "run-1" },
        { table: "tasks", action: "eq", column: "owner_id", match: "owner-1" },
        { table: "tasks", action: "eq", column: "project_id", match: "project-1" },
        { table: "tasks", action: "eq", column: "agent_name", match: "BuildAgent" },
        { table: "tasks", action: "neq", column: "status", match: "done" },
        expect.objectContaining({
          table: "run_events",
          action: "insert",
          value: expect.objectContaining({
            run_id: "run-1",
            agent_name: "BuildAgent",
            event_type: "task.status.updated",
            payload: { agentName: "BuildAgent", status: "done" }
          })
        })
      ])
    );
  });

  it("builds a Sandbox git setup command for /workspace", () => {
    const command = buildGitSetupShellCommand();

    expect(command).toContain("dnf install -y git");
    expect(command).toContain("cd /workspace");
    expect(command).toContain("git init");
  });

  it("builds a Vite preview overlay config that accepts Sandbox preview hostnames", () => {
    const config = buildVitePreviewConfigContent();

    expect(config).toContain("import userConfig from './vite.config'");
    expect(config).toContain("allowedHosts: true");
    expect(config).toContain("host: '0.0.0.0'");
    expect(config).toContain("mergeConfig");
  });

  it("starts Vite dev with the SMOTA preview overlay config", () => {
    expect(buildViteDevServerArgs(5173)).toEqual(["dev", "--config", "smota.vite.config.ts", "--host", "0.0.0.0", "--port", "5173", "--strictPort"]);
  });

  it("treats only an HTTP response from the preview port as healthy", () => {
    const command = buildPreviewServerEnsureShellCommand(5173);

    expect(command).toContain("curl -fsS http://127.0.0.1:5173/");
    expect(command).not.toContain("pgrep");
  });

  it("does not restart the preview server when the port is already listening", async () => {
    const calls: unknown[] = [];
    const insertedEvents: Array<Record<string, unknown>> = [];
    const sandbox = {
      async runCommand(params: unknown) {
        calls.push(params);
        return {
          async wait() {
            return { exitCode: 0 };
          }
        };
      }
    };
    const supabase = {
      from(table: string) {
        return {
          insert(payload: Record<string, unknown>) {
            insertedEvents.push({ table, ...payload });
            return Promise.resolve({ error: null });
          }
        };
      }
    };

    await expect(
      ensureSandboxPreviewServer({
        sandbox: sandbox as never,
        supabase: supabase as never,
        context: { ownerId: "owner-1", projectId: "project-1", runId: "run-1" },
        port: 5173
      })
    ).resolves.toEqual({ restarted: false, ready: true });
    expect(calls).toHaveLength(1);
    expect(insertedEvents.some((event) => event.event_type === "preview.ready")).toBe(false);
  });

  it("builds one preview recovery command that waits for Vite to listen", () => {
    const command = buildPreviewServerEnsureShellCommand(5173);

    expect(command).toContain("curl -fsS http://127.0.0.1:5173/");
    expect(command).toContain("nohup pnpm 'dev' '--config' 'smota.vite.config.ts' '--host' '0.0.0.0' '--port' '5173' '--strictPort'");
    expect(command).toContain("seq 1 60");
    expect(command).toContain("exit 10");
  });

  it("restarts the preview server with a single ready-waiting Sandbox task when the sandbox resumed without a listener", async () => {
    const calls: Array<{ cmd: string; args?: string[]; cwd?: string; detached?: true }> = [];
    const insertedEvents: Array<Record<string, unknown>> = [];
    const sandbox = {
      async runCommand(params: { cmd: string; args?: string[]; cwd?: string; detached?: true }) {
        calls.push(params);
        return {
          cmdId: "cmd-recover",
          async wait() {
            return { exitCode: 10 };
          }
        };
      }
    };
    const supabase = {
      from(table: string) {
        return {
          insert(payload: Record<string, unknown>) {
            insertedEvents.push({ table, ...payload });
            return Promise.resolve({ error: null });
          }
        };
      }
    };

    await expect(
      ensureSandboxPreviewServer({
        sandbox: sandbox as never,
        supabase: supabase as never,
        context: { ownerId: "owner-1", projectId: "project-1", runId: "run-1" },
        port: 5173
      })
    ).resolves.toEqual({ restarted: true, ready: true });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      cmd: "bash",
      cwd: "/workspace"
    });
    expect(insertedEvents.some((event) => event.event_type === "sandbox.command.started" && event.step === "dev_server_recover")).toBe(true);
    expect(insertedEvents.some((event) => event.event_type === "sandbox.command.finished" && event.step === "dev_server_recover")).toBe(true);
    expect(insertedEvents.some((event) => event.event_type === "preview.ready" && event.step === "preview_recovered")).toBe(true);
  });

  it("plans realtime file scans around early preview startup", () => {
    expect(buildRealtimeSandboxPhasePlan()).toEqual({
      fileScanPhases: ["harness_written", "init_vite", "preview_ready", "opencode_run", "install_after_opencode", "build"],
      previewStartsBeforeOpenCode: true,
      screenshotPhase: "after_build",
      reviewSteps: ["review_screenshot", "review_report"],
      runSuccessPhase: "after_review_report"
    });
  });

  it("upserts workspace file indexes with the scan phase instead of clearing rows first", async () => {
    const calls: Array<{ table: string; action: string; payload?: unknown; options?: unknown }> = [];
    const supabase = {
      from(table: string) {
        return {
          upsert(payload: unknown, options?: unknown) {
            calls.push({ table, action: "upsert", payload, options });
            return Promise.resolve({ error: null });
          },
          insert(payload: unknown) {
            calls.push({ table, action: "insert", payload });
            return Promise.resolve({ error: null });
          },
          delete() {
            calls.push({ table, action: "delete" });
            return {
              eq() {
                return this;
              }
            };
          }
        };
      }
    };
    const sandbox = {
      fs: {
        async mkdir() {
          return undefined;
        },
        async readdir(path: string) {
          if (path === "/workspace") {
            return [
              { name: "src", isDirectory: () => true, isFile: () => false },
              { name: "package.json", isDirectory: () => false, isFile: () => true }
            ];
          }
          if (path === "/workspace/src") {
            return [{ name: "App.tsx", isDirectory: () => false, isFile: () => true }];
          }
          return [];
        },
        async stat(path: string) {
          const directory = path === "/workspace/src";
          return {
            size: directory ? 0 : path.endsWith("App.tsx") ? 123 : 456,
            mtime: new Date("2026-06-28T00:00:00.000Z"),
            isDirectory: () => directory,
            isFile: () => !directory
          };
        }
      },
      async writeFiles() {
        return undefined;
      },
      async readFileToBuffer() {
        return null;
      }
    };

    const rows = await scanWorkspaceFiles({
      sandbox,
      supabase: supabase as never,
      context: { ownerId: "owner-1", projectId: "project-1", runId: "run-1" },
      phase: "init_vite"
    });

    expect(rows.map((row) => row.path)).toEqual(["src/App.tsx", "package.json"]);
    expect(calls.some((call) => call.table === "workspace_files" && call.action === "delete")).toBe(false);
    expect(calls).toContainEqual(
      expect.objectContaining({
        table: "workspace_files",
        action: "upsert",
        options: expect.objectContaining({ onConflict: "owner_id,project_id,run_id,path" })
      })
    );
    expect(calls).toContainEqual(
      expect.objectContaining({
        table: "run_events",
        action: "insert",
        payload: expect.objectContaining({
          event_type: "file.indexed",
          payload: expect.objectContaining({ phase: "init_vite", count: 2 })
        })
      })
    );
  });
});
