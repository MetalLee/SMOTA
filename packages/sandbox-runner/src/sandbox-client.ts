import { Sandbox } from "@vercel/sandbox";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { toSandboxEnvironment } from "./sandbox-security";

export interface SandboxRuntimeConfig {
  runtime: string;
  timeoutMs: number;
  publishPort: number;
}

export function buildSandboxRuntimeConfig(env: Record<string, string | undefined>): SandboxRuntimeConfig {
  return {
    runtime: env.SANDBOX_RUNTIME ?? env.SANDBOX_DEFAULT_RUNTIME ?? "node24",
    timeoutMs: Number(env.SANDBOX_TIMEOUT_MS ?? env.SANDBOX_DEFAULT_TIMEOUT_MS ?? 2700000),
    publishPort: Number(env.SANDBOX_PUBLISH_PORT ?? env.SANDBOX_PREVIEW_PORT ?? 5173)
  };
}

export function buildSandboxName(ids: { ownerId: string; projectId: string; runId: string }): string {
  return `smota-${ids.ownerId.slice(0, 8)}-${ids.projectId.slice(0, 8)}-${ids.runId.slice(0, 8)}`.toLowerCase();
}

export function getVercelSandboxToken(env: Record<string, string | undefined> = process.env): string | undefined {
  return env.VERCEL_SANDBOX_API_TOKEN ?? env.VERCEL_OIDC_TOKEN ?? env.VERCEL_TOKEN;
}

export function createSupabaseServiceClient(env: Record<string, string | undefined> = process.env): SupabaseClient {
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  }

  return createClient(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });
}

export async function createVercelSandbox(params: {
  name: string;
  config: SandboxRuntimeConfig;
  env?: Record<string, string | undefined>;
}) {
  return Sandbox.create({
    name: params.name,
    runtime: params.config.runtime,
    timeout: params.config.timeoutMs,
    ports: [params.config.publishPort],
    env: toSandboxEnvironment(params.env ?? process.env),
    token: getVercelSandboxToken(params.env ?? process.env),
    teamId: params.env?.VERCEL_TEAM_ID ?? process.env.VERCEL_TEAM_ID,
    projectId: params.env?.VERCEL_PROJECT_ID ?? process.env.VERCEL_PROJECT_ID,
    persistent: true
  });
}

export async function getVercelSandbox(name: string) {
  return Sandbox.get({
    name,
    token: getVercelSandboxToken(process.env),
    teamId: process.env.VERCEL_TEAM_ID,
    projectId: process.env.VERCEL_PROJECT_ID
  });
}

export function isVercelSandboxNotFoundError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;

  const record = error as Record<string, unknown>;
  const code = String(record.code ?? "").toLowerCase();
  const status = Number(record.status ?? record.statusCode ?? 0);
  const message = error instanceof Error ? error.message.toLowerCase() : String(record.message ?? "").toLowerCase();

  return status === 404 || code === "not_found" || message.includes("not_found") || message.includes("not found") || message.includes("404");
}

export async function deleteVercelSandbox(name: string) {
  const sandbox = await Sandbox.get({
    name,
    resume: false,
    token: getVercelSandboxToken(process.env),
    teamId: process.env.VERCEL_TEAM_ID,
    projectId: process.env.VERCEL_PROJECT_ID
  });
  await sandbox.delete();
}
