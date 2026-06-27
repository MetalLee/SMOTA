import { redirect } from "next/navigation";
import type { AgentRunRow, ArtifactRow, ProjectRow, RunEventRow, TaskRow, WorkspaceFileRow } from "@smota/shared";
import { toProjectCards, type SandboxRunPreviewRow } from "@/lib/my-projects";
import { createClient } from "@/lib/supabase/server";

export async function getCurrentUser() {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  return { supabase, user };
}

export async function getDashboardData() {
  const { supabase, user } = await getCurrentUser();
  const { data: projects } = await supabase
    .from("projects")
    .select("*")
    .eq("owner_id", user.id)
    .order("created_at", { ascending: false })
    .limit(8);

  return { user, projects: (projects ?? []) as ProjectRow[] };
}

export async function getMyProjectsData() {
  const { supabase, user } = await getCurrentUser();
  const { data: projects } = await supabase
    .from("projects")
    .select("*")
    .eq("owner_id", user.id)
    .order("updated_at", { ascending: false });

  const projectRows = (projects ?? []) as ProjectRow[];
  const projectIds = projectRows.map((project) => project.id);

  const { data: runs } = projectIds.length
    ? await supabase
        .from("sandbox_runs")
        .select("project_id,preview_url,preview_image_url,updated_at")
        .eq("owner_id", user.id)
        .in("project_id", projectIds)
        .order("updated_at", { ascending: false })
    : { data: [] };

  const previewRows = (runs ?? []).map((run) => ({
    project_id: String(run.project_id),
    preview_url: typeof run.preview_url === "string" ? run.preview_url : null,
    preview_image_url: typeof run.preview_image_url === "string" ? run.preview_image_url : null,
    updated_at: String(run.updated_at)
  })) satisfies SandboxRunPreviewRow[];

  return {
    user,
    projects: projectRows,
    projectCards: toProjectCards(projectRows, previewRows)
  };
}

export async function getProjectWorkspace(projectId: string) {
  const { supabase, user } = await getCurrentUser();

  const { data: project } = await supabase
    .from("projects")
    .select("*")
    .eq("id", projectId)
    .eq("owner_id", user.id)
    .single();

  if (!project) {
    redirect("/dashboard");
  }

  const { data: runs } = await supabase
    .from("agent_runs")
    .select("*")
    .eq("project_id", projectId)
    .eq("owner_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1);

  const run = runs?.[0] as AgentRunRow | undefined;
  if (!run) {
    redirect("/dashboard");
  }

  const [{ data: artifacts }, { data: tasks }, { data: events }, { data: files }] = await Promise.all([
    supabase
      .from("artifacts")
      .select("*")
      .eq("project_id", projectId)
      .eq("run_id", run.id)
      .eq("owner_id", user.id)
      .order("created_at", { ascending: true }),
    supabase
      .from("tasks")
      .select("*")
      .eq("project_id", projectId)
      .eq("run_id", run.id)
      .eq("owner_id", user.id)
      .order("sort_order", { ascending: true }),
    supabase
      .from("run_events")
      .select("*")
      .eq("project_id", projectId)
      .eq("run_id", run.id)
      .eq("owner_id", user.id)
      .order("created_at", { ascending: true }),
    supabase
      .from("workspace_files")
      .select("*")
      .eq("project_id", projectId)
      .eq("owner_id", user.id)
      .order("path", { ascending: true })
  ]);

  return {
    user,
    project: project as ProjectRow,
    run,
    artifacts: (artifacts ?? []) as ArtifactRow[],
    tasks: (tasks ?? []) as TaskRow[],
    events: (events ?? []) as RunEventRow[],
    files: (files ?? []) as WorkspaceFileRow[]
  };
}
