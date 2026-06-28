export type ContinuationSourceKind = "own_previous_run" | "cloned_workspace";

export interface ContinuationProjectInput {
  source_project_id?: string | null;
}

export interface ContinuationRunInput {
  id: string;
  sandbox_name: string | null;
  sandbox_preview_url?: string | null;
  current_step?: string | null;
  status?: string | null;
  sandbox_status?: string | null;
  created_at: string;
}

export interface ContinuationFileInput {
  run_id: string | null;
  path: string;
}

export interface ContinuationWorkspaceSource<TFile extends ContinuationFileInput = ContinuationFileInput> {
  sourceRunId: string;
  sourceSandboxName: string;
  sourcePreviewUrl: string | null;
  isClonedWorkspace: boolean;
  workspaceFiles: TFile[];
}

function isReusableRun(run: ContinuationRunInput): boolean {
  return Boolean(run.sandbox_name);
}

function isClonedSource(project: ContinuationProjectInput, run: ContinuationRunInput): boolean {
  return Boolean(project.source_project_id) || run.current_step === "cloned_previewing";
}

export function selectContinuationWorkspaceSource<TFile extends ContinuationFileInput>(input: {
  project: ContinuationProjectInput;
  currentRunId: string;
  runs: ContinuationRunInput[];
  files: TFile[];
}): ContinuationWorkspaceSource<TFile> | null {
  const filesByRunId = new Map<string, TFile[]>();
  for (const file of input.files) {
    if (!file.run_id) continue;
    const current = filesByRunId.get(file.run_id) ?? [];
    current.push(file);
    filesByRunId.set(file.run_id, current);
  }

  const orderedRuns = [...input.runs].sort((a, b) => {
    if (a.id === input.currentRunId) return -1;
    if (b.id === input.currentRunId) return 1;
    return b.created_at.localeCompare(a.created_at);
  });

  for (const run of orderedRuns) {
    const workspaceFiles = filesByRunId.get(run.id) ?? [];
    const sourceSandboxName = run.sandbox_name;
    if (!isReusableRun(run) || !sourceSandboxName || workspaceFiles.length === 0) {
      continue;
    }

    return {
      sourceRunId: run.id,
      sourceSandboxName,
      sourcePreviewUrl: run.sandbox_preview_url ?? null,
      isClonedWorkspace: isClonedSource(input.project, run),
      workspaceFiles
    };
  }

  return null;
}
