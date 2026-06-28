export function buildCloneProjectName(sourceName: string, requestedName: string) {
  const customName = requestedName.replace(/\s+/g, " ").trim();
  if (customName) {
    return customName;
  }

  const baseName = sourceName.replace(/\s+/g, " ").trim() || "未命名项目";
  return `${baseName}（克隆）`;
}

function shellQuote(value: string) {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

export function buildCloneWorkspaceArchiveCommand(archivePath: string) {
  return [
    "set -e",
    `rm -f ${shellQuote(archivePath)}`,
    [
      "tar -czf",
      shellQuote(archivePath),
      "--exclude='./node_modules'",
      "--exclude='./dist'",
      "--exclude='./.next'",
      "--exclude='./.vercel'",
      "--exclude='./.git'",
      "-C /workspace ."
    ].join(" ")
  ].join("\n");
}

export function buildExtractCloneWorkspaceArchiveCommand(archivePath: string) {
  return ["set -e", "mkdir -p /workspace", `tar -xzf ${shellQuote(archivePath)} -C /workspace`].join("\n");
}

export function buildCloneDependencyInstallCommand() {
  return ["corepack enable >/dev/null 2>&1 || true", "pnpm install"].join(" && ");
}

export function getCloneWorkspaceBootstrapCwd() {
  return "/";
}

export interface SourceCloneArtifact {
  type: string;
  title: string;
  path: string;
  content: string;
  created_at?: string | null;
}

export function buildClonedArtifactRows(
  sourceArtifacts: SourceCloneArtifact[],
  target: { ownerId: string; projectId: string; runId: string }
) {
  const latestByPath = new Map<string, SourceCloneArtifact>();

  for (const artifact of sourceArtifacts) {
    const current = latestByPath.get(artifact.path);
    if (!current || String(artifact.created_at ?? "").localeCompare(String(current.created_at ?? "")) >= 0) {
      latestByPath.set(artifact.path, artifact);
    }
  }

  return [...latestByPath.values()]
    .sort((a, b) => a.path.localeCompare(b.path))
    .map((artifact) => ({
      owner_id: target.ownerId,
      project_id: target.projectId,
      run_id: target.runId,
      type: artifact.type,
      title: artifact.title,
      path: artifact.path,
      content: artifact.content
    }));
}

export function shouldAutoStartClone(runStatus: string, currentStep: string | null) {
  return runStatus === "running" && currentStep === "clone_queued";
}

export type CloneStartState = "claimable" | "already_running" | "finished" | "invalid";

export function getCloneStartState(runStatus: string, currentStep: string | null): CloneStartState {
  if (runStatus === "succeeded" || runStatus === "failed") {
    return "finished";
  }

  if (runStatus !== "running") {
    return "invalid";
  }

  if (currentStep === "clone_queued") {
    return "claimable";
  }

  if (currentStep?.includes("clone") || currentStep === "archive_source_workspace" || currentStep === "extract_clone_workspace" || currentStep === "start_clone_preview") {
    return "already_running";
  }

  return "invalid";
}

export interface CloneSourceSandboxCandidateInput {
  sandbox_name: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export function getCloneSourceSandboxCandidates(
  runs: CloneSourceSandboxCandidateInput[],
  sandboxRuns: CloneSourceSandboxCandidateInput[]
) {
  const candidates = [...runs, ...sandboxRuns]
    .map((item) => ({
      name: item.sandbox_name?.trim() ?? "",
      timestamp: item.updated_at ?? item.created_at ?? ""
    }))
    .filter((item) => item.name)
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  const names = new Set<string>();

  for (const candidate of candidates) {
    names.add(candidate.name);
  }

  return [...names];
}

function stringifyCloneErrorValue(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function cloneErrorDetails(error: unknown): string[] {
  if (!error || typeof error !== "object") return [];

  const details: string[] = [];
  const record = error as Record<string, unknown>;
  for (const key of ["status", "statusCode", "code", "body", "data", "details", "response"]) {
    const value = stringifyCloneErrorValue(record[key]);
    if (value) {
      details.push(`${key}=${value}`);
    }
  }

  if (error instanceof Error && error.cause) {
    const cause = formatCloneWorkflowError(error.cause, "");
    if (cause) {
      details.push(`cause=${cause}`);
    }
  }

  return details;
}

export function formatCloneWorkflowError(error: unknown, fallback: string) {
  const base = error instanceof Error ? error.message : stringifyCloneErrorValue(error) ?? fallback;
  const details = cloneErrorDetails(error).filter((detail) => detail && detail !== base);
  const message = [base, ...details].filter(Boolean).join(" | ");
  return message.slice(0, 4000) || fallback;
}

export function buildCloneCommandFailureMessage(summary: string, commandOutput: string) {
  const output = commandOutput.trim();
  if (!output) return summary;
  return `${summary}\n${output}`.slice(0, 4000);
}

export function buildCloneStepFailureMessage(summary: string, error: unknown) {
  return buildCloneCommandFailureMessage(summary, formatCloneWorkflowError(error, ""));
}
