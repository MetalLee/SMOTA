const SANDBOX_ENV_ALLOWLIST = [
  "DEEPSEEK_API_KEY",
  "OPENAI_API_KEY",
  "OPENAI_BASE_URL",
  "OPENAI_MODEL"
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

export function isProbablyBinary(content: Buffer): boolean {
  const sample = content.subarray(0, Math.min(content.length, 8192));
  return sample.includes(0);
}
