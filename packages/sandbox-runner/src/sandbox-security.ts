import { createHmac } from "node:crypto";

const SANDBOX_ENV_ALLOWLIST = [
  "DEEPSEEK_API_KEY",
  "OPENAI_API_KEY",
  "OPENAI_BASE_URL",
  "OPENAI_MODEL",
  "SMOTA_TASK_UPDATE_URL",
  "SMOTA_TASK_UPDATE_TOKEN"
] as const;

export const DEEPSEEK_OPENAI_BASE_URL = "https://api.deepseek.com";
export const DEEPSEEK_V4_PRO_MODEL = "deepseek-v4-pro";
export const OPENCODE_DEEPSEEK_V4_PRO_MODEL = "deepseek/deepseek-v4-pro";

export function sanitizeWorkspacePath(inputPath: string): string {
  const normalized = inputPath.replaceAll("\\", "/").replace(/^\/+/, "");
  const parts = normalized.split("/").filter(Boolean);

  if (!normalized || parts.some((part) => part === ".." || part === ".")) {
    throw new Error("Invalid workspace path.");
  }

  return parts.join("/");
}

export function toSandboxEnvironment(source: Record<string, string | undefined>): Record<string, string> {
  return Object.fromEntries(
    SANDBOX_ENV_ALLOWLIST.flatMap((key) => {
      const value = source[key];
      return value ? [[key, value]] : [];
    })
  );
}

export function buildSandboxCodingAgentEnvironment(source: Record<string, string | undefined>): Record<string, string> {
  const apiKey = source.DEEPSEEK_API_KEY ?? source.OPENAI_API_KEY;
  return toSandboxEnvironment({
    ...source,
    DEEPSEEK_API_KEY: apiKey,
    OPENAI_API_KEY: apiKey,
    OPENAI_BASE_URL: source.OPENAI_BASE_URL || DEEPSEEK_OPENAI_BASE_URL,
    OPENAI_MODEL: source.OPENAI_MODEL || DEEPSEEK_V4_PRO_MODEL
  });
}

export function getTaskUpdateSecret(source: Record<string, string | undefined>): string {
  return source.SMOTA_TASK_UPDATE_SECRET ?? source.SUPABASE_SERVICE_ROLE_KEY ?? "";
}

export function buildTaskUpdateToken(input: { ownerId: string; runId: string; secret: string }): string {
  return createHmac("sha256", input.secret).update(`${input.ownerId}:${input.runId}`).digest("hex");
}

export function buildTaskUpdateApiBaseUrl(input: { env: Record<string, string | undefined>; runId: string }): string {
  const appUrl =
    input.env.SMOTA_APP_URL ??
    input.env.NEXT_PUBLIC_APP_URL ??
    input.env.NEXT_PUBLIC_SITE_URL ??
    (input.env.VERCEL_URL ? `https://${input.env.VERCEL_URL}` : "");
  const trimmedAppUrl = appUrl.replace(/\/+$/, "");
  return `${trimmedAppUrl}/api/runs/${input.runId}`;
}

export function isProbablyBinary(content: Buffer): boolean {
  const sample = content.subarray(0, Math.min(content.length, 8192));
  return sample.includes(0);
}
