import type { SupabaseClient } from "@supabase/supabase-js";
import type { CommandRunnerSandbox } from "./sandbox-commands";
import { insertRunEvent, type RunContext } from "./sandbox-events";
import { buildViteDevServerArgs } from "./sandbox-workflow";
import { WORKSPACE_DIR } from "./sandbox-files";

export function buildPreviewServerHealthcheckShellCommand(port: number): string {
  return `curl -fsS http://127.0.0.1:${port}/ >/dev/null 2>&1`;
}

export function buildPreviewServerEnsureShellCommand(port: number): string {
  const args = buildViteDevServerArgs(port).map((arg) => `'${arg.replaceAll("'", "'\\''")}'`).join(" ");
  return [
    "set +e",
    `if ${buildPreviewServerHealthcheckShellCommand(port)}; then exit 0; fi`,
    `nohup pnpm ${args} > .smota-preview-server.log 2>&1 &`,
    "server_pid=$!",
    "for attempt in $(seq 1 60); do",
    `  curl -fsS http://127.0.0.1:${port}/ >/dev/null 2>&1 && exit 10`,
    `  kill -0 "$server_pid" >/dev/null 2>&1 || break`,
    "  sleep 1",
    "done",
    "tail -n 80 .smota-preview-server.log >&2 || true",
    "exit 1"
  ].join("\n");
}

export async function ensureSandboxPreviewServer(params: {
  supabase: SupabaseClient;
  context: RunContext;
  sandbox: CommandRunnerSandbox;
  port: number;
  timeoutMs?: number;
}): Promise<{ restarted: boolean; ready: boolean }> {
  await insertRunEvent(params.supabase, params.context, {
    eventType: "sandbox.command.started",
    step: "dev_server_recover",
    message: `ensure Vite dev server on port ${params.port}`,
    payload: { port: params.port }
  });

  const command = await params.sandbox.runCommand({
    cmd: "bash",
    args: ["-lc", buildPreviewServerEnsureShellCommand(params.port)],
    cwd: WORKSPACE_DIR,
    timeoutMs: 90 * 1000
  });
  const finished = await command.wait();

  await insertRunEvent(params.supabase, params.context, {
    eventType: "sandbox.command.finished",
    step: "dev_server_recover",
    message: `preview server ensure exited with ${finished.exitCode}`,
    payload: { cmdId: command.cmdId, exitCode: finished.exitCode, port: params.port }
  });

  if (finished.exitCode === 0) {
    return { restarted: false, ready: true };
  }

  if (finished.exitCode !== 10) {
    throw new Error(`Preview server recovery failed with exit code ${finished.exitCode}.`);
  }

  await insertRunEvent(params.supabase, params.context, {
    eventType: "preview.ready",
    step: "preview_recovered",
    message: `Restarted Vite dev server on port ${params.port}.`,
    payload: { port: params.port }
  });

  return { restarted: true, ready: true };
}
