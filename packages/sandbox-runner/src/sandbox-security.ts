const SANDBOX_ENV_ALLOWLIST = [
  "CODEX_API_KEY",
  "OPENAI_API_KEY",
  "ANTHROPIC_API_KEY",
  "CODEX_HOME",
  "CODEX_AUTH_TOKEN"
] as const;

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

export function isProbablyBinary(content: Buffer): boolean {
  const sample = content.subarray(0, Math.min(content.length, 8192));
  return sample.includes(0);
}
