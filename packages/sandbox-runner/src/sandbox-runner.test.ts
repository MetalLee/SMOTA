import { describe, expect, it } from "vitest";
import {
  buildCodexPrompt,
  buildSandboxName,
  buildSandboxRuntimeConfig,
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

  it("keeps Supabase service role keys out of Sandbox environment", () => {
    expect(
      toSandboxEnvironment({
        CODEX_API_KEY: "codex-secret",
        OPENAI_API_KEY: "openai-secret",
        SUPABASE_SERVICE_ROLE_KEY: "must-not-leak",
        NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co"
      })
    ).toEqual({
      CODEX_API_KEY: "codex-secret",
      OPENAI_API_KEY: "openai-secret"
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

  it("builds a Codex prompt from tasks and harness artifacts", () => {
    const prompt = buildCodexPrompt({
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
});
