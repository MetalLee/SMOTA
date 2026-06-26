import type { Command, CommandFinished } from "@vercel/sandbox";
import { insertRunEvent, type RunContext } from "./sandbox-events";
import type { SupabaseClient } from "@supabase/supabase-js";

export interface CommandRunnerSandbox {
  runCommand(params: {
    cmd: string;
    args?: string[];
    cwd?: string;
    env?: Record<string, string>;
    detached?: true;
    timeoutMs?: number;
  }): Promise<Command>;
}

export async function runSandboxCommand(params: {
  supabase: SupabaseClient;
  context: RunContext;
  sandbox: CommandRunnerSandbox;
  step: string;
  cmd: string;
  args?: string[];
  cwd?: string;
  env?: Record<string, string>;
  timeoutMs?: number;
}): Promise<CommandFinished> {
  await insertRunEvent(params.supabase, params.context, {
    eventType: "sandbox.command.started",
    step: params.step,
    message: [params.cmd, ...(params.args ?? [])].join(" "),
    payload: { cmd: params.cmd, args: params.args ?? [], cwd: params.cwd }
  });

  const command = await params.sandbox.runCommand({
    cmd: params.cmd,
    args: params.args,
    cwd: params.cwd,
    env: params.env,
    detached: true,
    timeoutMs: params.timeoutMs
  });

  for await (const log of command.logs()) {
    await insertRunEvent(params.supabase, params.context, {
      eventType: log.stream === "stdout" ? "sandbox.command.stdout" : "sandbox.command.stderr",
      step: params.step,
      message: log.data,
      stream: log.stream,
      payload: { cmdId: command.cmdId }
    });
  }

  const finished = await command.wait();
  await insertRunEvent(params.supabase, params.context, {
    eventType: "sandbox.command.finished",
    step: params.step,
    message: `${params.cmd} exited with ${finished.exitCode}`,
    payload: { cmdId: command.cmdId, exitCode: finished.exitCode }
  });

  return finished;
}

export async function startDetachedSandboxCommand(params: {
  supabase: SupabaseClient;
  context: RunContext;
  sandbox: CommandRunnerSandbox;
  step: string;
  cmd: string;
  args?: string[];
  cwd?: string;
  env?: Record<string, string>;
  timeoutMs?: number;
}) {
  await insertRunEvent(params.supabase, params.context, {
    eventType: "sandbox.command.started",
    step: params.step,
    message: [params.cmd, ...(params.args ?? [])].join(" "),
    payload: { cmd: params.cmd, args: params.args ?? [], cwd: params.cwd, detached: true }
  });

  const command = await params.sandbox.runCommand({
    cmd: params.cmd,
    args: params.args,
    cwd: params.cwd,
    env: params.env,
    detached: true,
    timeoutMs: params.timeoutMs
  });

  await insertRunEvent(params.supabase, params.context, {
    eventType: "sandbox.command.finished",
    step: params.step,
    message: `${params.cmd} started in detached mode.`,
    payload: { cmdId: command.cmdId, detached: true }
  });

  return command;
}

export async function commandOutput(command: CommandFinished): Promise<string> {
  const [stdout, stderr] = await Promise.all([command.stdout(), command.stderr()]);
  return [stdout, stderr].filter(Boolean).join("\n");
}
