import { WorkbenchClient } from "@/components/workbench-client";
import type { AgentRunRow, ArtifactRow, ProjectRow, RunEventRow, TaskRow, WorkspaceFileRow } from "@smota/shared";

interface WorkbenchProps {
  project: ProjectRow;
  run: AgentRunRow;
  artifacts: ArtifactRow[];
  tasks: TaskRow[];
  events: RunEventRow[];
  files: WorkspaceFileRow[];
  activeTab: string;
  filePath?: string;
}

export function Workbench({ project, run, artifacts, tasks, events, files, activeTab, filePath }: WorkbenchProps) {
  return (
    <WorkbenchClient
      initialProject={project}
      initialRun={run}
      initialArtifacts={artifacts}
      initialTasks={tasks}
      initialEvents={events}
      initialFiles={files}
      initialActiveTab={activeTab}
      initialFilePath={filePath}
    />
  );
}
