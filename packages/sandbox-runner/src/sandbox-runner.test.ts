import { describe, expect, it } from "vitest";
import {
  buildCodingAgentPrompt,
  buildGitSetupShellCommand,
  buildOpenCodeConfig,
  buildOpenCodeRunShellCommand,
  buildViteDevServerArgs,
  buildVitePreviewConfigContent,
  buildSandboxCodingAgentEnvironment,
  buildSandboxName,
  buildSandboxRuntimeConfig,
  getVercelSandboxToken,
  isProbablyBinary,
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
});
