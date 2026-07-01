import { after } from "next/server";

export function getSandboxWorkerToken(env: Record<string, string | undefined> = process.env): string {
  const token = env.SANDBOX_WORKER_TOKEN ?? env.SUPABASE_SERVICE_ROLE_KEY;
  if (!token) {
    throw new Error("Missing SANDBOX_WORKER_TOKEN or SUPABASE_SERVICE_ROLE_KEY for Sandbox workflow worker dispatch.");
  }
  return token;
}

export function isAuthorizedSandboxWorkerRequest(request: Request, env: Record<string, string | undefined> = process.env): boolean {
  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice("Bearer ".length) : "";
  return Boolean(token) && token === getSandboxWorkerToken(env);
}

export function buildSandboxWorkerUrl(request: Request): string {
  return new URL("/api/internal/sandbox/workflow", request.url).toString();
}

export function dispatchSandboxWorkflowWorker(input: { workerUrl: string; runId: string; env?: Record<string, string | undefined> }) {
  const token = getSandboxWorkerToken(input.env);
  after(async () => {
    try {
      await fetch(input.workerUrl, {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json"
        },
        body: JSON.stringify({ runId: input.runId }),
        cache: "no-store"
      });
    } catch (error) {
      console.error("Sandbox workflow worker dispatch failed", error);
    }
  });
}
