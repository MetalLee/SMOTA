export type AppMode = "plan-first" | "quick-build";

export type AppType = "Web App" | "Admin" | "Landing Page" | "SaaS Demo";

export type AgentName =
  | "ProductAgent"
  | "ArchitectAgent"
  | "PlannerAgent"
  | "CodingAgent"
  | "BuildAgent"
  | "ReviewerAgent";

export type ArtifactPath =
  | "PROJECT_BRIEF.md"
  | "ARCHITECTURE.md"
  | "ROADMAP.md"
  | "CODEX_TASK_RULES.md"
  | "AGENTS.md";

export interface ProjectCreationInput {
  prompt: string;
  mode: AppMode;
  appType: AppType;
}

export interface HarnessArtifact {
  type: "harness";
  title: string;
  path: ArtifactPath;
  content: string;
}

export interface GeneratedTask {
  title: string;
  description: string;
  status: "todo" | "in_progress" | "done" | "failed";
  sortOrder: number;
  agentName: AgentName;
}

export interface GeneratedRunEvent {
  agentName: AgentName;
  eventType: "agent.started" | "agent.reasoning" | "agent.completed" | "run.created" | "plan.approved";
  step: string;
  message: string;
  stream?: "stdout" | "stderr" | "system";
  metadata?: Record<string, unknown>;
}

export interface HarnessBundle {
  projectName?: string;
  artifacts: HarnessArtifact[];
  tasks: GeneratedTask[];
  events: GeneratedRunEvent[];
}

export interface ProjectRow {
  id: string;
  owner_id: string;
  name: string;
  description: string | null;
  prompt: string;
  app_type: AppType | string;
  mode: AppMode | string;
  status: string;
  is_shared_to_discovery?: boolean;
  shared_at?: string | null;
  source_project_id?: string | null;
  created_at: string;
  updated_at: string;
}

export interface AgentRunRow {
  id: string;
  owner_id: string;
  project_id: string;
  parent_run_id?: string | null;
  mode: AppMode | string;
  user_prompt: string;
  status: string;
  current_step: string | null;
  runner_provider: string;
  sandbox_name: string | null;
  sandbox_status: string | null;
  sandbox_runtime: string;
  sandbox_timeout_ms: number | null;
  sandbox_preview_url: string | null;
  build_status: string | null;
  build_error: string | null;
  fix_attempted: boolean;
  created_at: string;
  updated_at: string;
}

export interface ArtifactRow {
  id: string;
  owner_id: string;
  project_id: string;
  run_id: string;
  type: string;
  title: string;
  path: string;
  content: string;
  created_at: string;
  updated_at: string;
}

export interface TaskRow {
  id: string;
  owner_id: string;
  project_id: string;
  run_id: string;
  title: string;
  description: string | null;
  status: string;
  agent_name: AgentName | string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface RunEventRow {
  id: string;
  owner_id: string;
  project_id: string;
  run_id: string;
  agent_name: AgentName | string | null;
  event_type: string;
  step: string | null;
  message: string | null;
  stream: string | null;
  payload?: Record<string, unknown>;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface WorkspaceFileRow {
  id: string;
  owner_id: string;
  project_id: string;
  run_id: string | null;
  path: string;
  file_type: string | null;
  change_type: string | null;
  size: number | null;
  last_modified_at: string | null;
  created_at: string;
  updated_at: string;
}
