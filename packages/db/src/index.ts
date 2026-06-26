export const BUSINESS_TABLES = [
  "profiles",
  "projects",
  "agent_runs",
  "agent_steps",
  "tasks",
  "artifacts",
  "workspace_files",
  "run_events",
  "settings",
  "sandbox_runs"
] as const;

export type BusinessTable = (typeof BUSINESS_TABLES)[number];
