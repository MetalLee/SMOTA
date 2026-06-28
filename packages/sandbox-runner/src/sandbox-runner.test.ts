import { describe, expect, it } from "vitest";
import {
  buildCodingAgentPrompt,
  buildContinuationCodingAgentPrompt,
  buildGitSetupShellCommand,
  buildOpenCodeConfig,
  buildOpenCodeRunShellCommand,
  buildPreviewServerEnsureShellCommand,
  buildRealtimeSandboxPhasePlan,
  buildViteDevServerArgs,
  buildVitePreviewConfigContent,
  ensureSandboxPreviewServer,
  buildSandboxCodingAgentEnvironment,
  buildSandboxName,
  buildSandboxRuntimeConfig,
  getVercelSandboxToken,
  isVercelSandboxNotFoundError,
  isProbablyBinary,
  scanWorkspaceFiles,
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
        SUPABASE_SERVICE_ROLE_KEY: "must-not-leak"
      })
    ).toEqual({
      OPENAI_API_KEY: "deepseek-key",
      OPENAI_BASE_URL: "https://api.deepseek.com",
      OPENAI_MODEL: "deepseek-v4-pro",
      DEEPSEEK_API_KEY: "deepseek-key"
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
        { title: "Create shell", description: "Add the primary layout" },
        { title: "Wire state", description: null }
      ],
      artifacts: [
        { path: "PROJECT_BRIEF.md", content: "# Brief\nUse Vite." },
        { path: "AGENTS.md", content: "# Agents\nUse CodingAgent." }
      ]
    });

    expect(prompt).toContain("Build a booking dashboard");
    expect(prompt).toContain("Create shell");
    expect(prompt).toContain("PROJECT_BRIEF.md");
    expect(prompt).toContain("All generated application code must stay inside /workspace.");
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
      tasks: [{ title: "实现筛选器", description: "保持现有风格" }],
      artifacts: [{ path: "ROADMAP.md", content: "# 路线图\n增量修改" }],
      workspaceFiles: ["package.json", "src/App.tsx"]
    });

    expect(prompt).toContain("当前 /workspace 已经存在项目文件");
    expect(prompt).toContain("克隆来的已有应用");
    expect(prompt).toContain("增加负责人筛选器");
    expect(prompt).toContain("不要重新初始化、重建或覆盖整个项目");
    expect(prompt).toContain("src/App.tsx");
  });

  it("builds OpenCode run commands for the DeepSeek v4 Pro build agent", () => {
    expect(buildOpenCodeRunShellCommand("opencode", "deepseek/deepseek-v4-pro", "hello")).toBe(
      "opencode run --model deepseek/deepseek-v4-pro --agent build --dangerously-skip-permissions 'hello'"
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
      screenshotPhase: "after_build"
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
