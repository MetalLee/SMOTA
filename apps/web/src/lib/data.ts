import { redirect } from "next/navigation";
import type { AgentRunRow, ArtifactRow, ProjectRow, RunEventRow, TaskRow, WorkspaceFileRow } from "@smota/shared";
import { createSupabaseServiceClient } from "@smota/sandbox-runner";
import { toDiscoveryProjectCards, toProjectCards, type SandboxRunPreviewRow, type SharedProjectCardMetadata } from "@/lib/my-projects";
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

function toSandboxPreviewRows(runs: unknown[] | null | undefined): SandboxRunPreviewRow[] {
  return (runs ?? []).map((run) => {
    const row = run as Record<string, unknown>;
    return {
      project_id: String(row.project_id),
      preview_url: typeof row.preview_url === "string" ? row.preview_url : null,
      preview_image_url: typeof row.preview_image_url === "string" ? row.preview_image_url : null,
      updated_at: String(row.updated_at)
    };
  });
}

async function getSharedProjectCardMetadata(
  supabase: ReturnType<typeof createSupabaseServiceClient>,
  projects: ProjectRow[]
): Promise<SharedProjectCardMetadata[]> {
  if (!projects.length) return [];

  const ownerIds = [...new Set(projects.map((project) => project.owner_id))];
  const projectIds = projects.map((project) => project.id);
  const [{ data: profiles }, { data: stats }] = await Promise.all([
    supabase.from("profiles").select("owner_id,display_name,email,avatar_url").in("owner_id", ownerIds),
    supabase.from("project_share_stats").select("project_id,view_count").in("project_id", projectIds)
  ]);
  const profileByOwner = new Map((profiles ?? []).map((profile) => [String(profile.owner_id), profile as Record<string, unknown>]));
  const statsByProject = new Map((stats ?? []).map((row) => [String(row.project_id), Number(row.view_count ?? 0)]));

  return projects.map((project) => {
    const profile = profileByOwner.get(project.owner_id);
    const displayName = typeof profile?.display_name === "string" ? profile.display_name.trim() : "";
    const email = typeof profile?.email === "string" ? profile.email.trim() : "";
    return {
      projectId: project.id,
      creatorName: displayName || email || "SMOTA 创作者",
      creatorAvatarUrl: typeof profile?.avatar_url === "string" && profile.avatar_url.trim() ? profile.avatar_url.trim() : null,
      viewCount: statsByProject.get(project.id) ?? 0
    };
  });
}

export async function getMyProjectsData(activeTab: "all" | "favorites" = "all") {
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

  const previewRows = toSandboxPreviewRows(runs);

  if (activeTab === "favorites") {
    const admin = createSupabaseServiceClient();
    const { data: favorites } = await supabase
      .from("project_favorites")
      .select("project_id")
      .eq("owner_id", user.id)
      .order("created_at", { ascending: false });
    const favoriteIds = (favorites ?? []).map((favorite) => String(favorite.project_id));
    const { data: favoriteProjectRows } = favoriteIds.length
      ? await supabase.from("projects").select("*").in("id", favoriteIds).order("updated_at", { ascending: false })
      : { data: [] };
    const favoriteProjects = (favoriteProjectRows ?? []) as ProjectRow[];
    const favoriteProjectIds = favoriteProjects.map((project) => project.id);
    const { data: favoriteRuns } = favoriteProjectIds.length
      ? await admin
          .from("sandbox_runs")
          .select("project_id,preview_url,preview_image_url,updated_at")
          .in("project_id", favoriteProjectIds)
          .not("preview_url", "is", null)
          .order("updated_at", { ascending: false })
      : { data: [] };

    return {
      user,
      projects: projectRows,
      projectCards: toDiscoveryProjectCards(favoriteProjects, toSandboxPreviewRows(favoriteRuns), await getSharedProjectCardMetadata(admin, favoriteProjects))
    };
  }

  return {
    user,
    projects: projectRows,
    projectCards: toProjectCards(projectRows, previewRows)
  };
}

export async function getResourceData() {
  const { supabase, user } = await getCurrentUser();
  const admin = createSupabaseServiceClient();
  const { data: sidebarProjects } = await supabase
    .from("projects")
    .select("*")
    .eq("owner_id", user.id)
    .order("created_at", { ascending: false })
    .limit(8);

  const { data: sharedProjects } = await admin
    .from("projects")
    .select("*")
    .eq("is_shared_to_discovery", true)
    .order("shared_at", { ascending: false });

  const projectRows = (sharedProjects ?? []) as ProjectRow[];
  const projectIds = projectRows.map((project) => project.id);
  const { data: runs } = projectIds.length
    ? await admin
        .from("sandbox_runs")
        .select("project_id,preview_url,preview_image_url,updated_at")
        .in("project_id", projectIds)
        .not("preview_url", "is", null)
        .order("updated_at", { ascending: false })
    : { data: [] };

  return {
    user,
    projects: (sidebarProjects ?? []) as ProjectRow[],
    discoveryCards: toDiscoveryProjectCards(projectRows, toSandboxPreviewRows(runs), await getSharedProjectCardMetadata(admin, projectRows)).filter((card) => card.published)
  };
}

export async function getSharedProjectData(projectId: string) {
  const { supabase, user } = await getCurrentUser();
  const admin = createSupabaseServiceClient();
  const { data: sidebarProjects } = await supabase
    .from("projects")
    .select("*")
    .eq("owner_id", user.id)
    .order("created_at", { ascending: false })
    .limit(8);

  const [{ data: project }, { data: sandboxRuns }, { data: stats }, { data: favorite }] = await Promise.all([
    admin.from("projects").select("*").eq("id", projectId).eq("is_shared_to_discovery", true).single(),
    admin
      .from("sandbox_runs")
      .select("run_id,project_id,status,preview_url,preview_image_url,updated_at")
      .eq("project_id", projectId)
      .not("preview_url", "is", null)
      .order("updated_at", { ascending: false })
      .limit(1),
    admin.from("project_share_stats").select("*").eq("project_id", projectId).maybeSingle(),
    supabase.from("project_favorites").select("id").eq("owner_id", user.id).eq("project_id", projectId).maybeSingle()
  ]);

  if (!project) {
    redirect("/resource");
  }

  await admin.rpc("increment_project_view_count", { target_project_id: projectId });

  const ownerId = String(project.owner_id);
  const { data: creator } = await admin.from("profiles").select("display_name,email,avatar_url").eq("owner_id", ownerId).maybeSingle();
  const latestRun = toSandboxPreviewRows(sandboxRuns)[0] ?? null;
  const latestSandboxRun = (sandboxRuns?.[0] ?? null) as { run_id?: string | null; status?: string | null } | null;

  return {
    user,
    projects: (sidebarProjects ?? []) as ProjectRow[],
    project: project as ProjectRow,
    runId: typeof latestSandboxRun?.run_id === "string" ? latestSandboxRun.run_id : null,
    previewUrl: latestRun?.preview_url ?? null,
    sandboxStatus: typeof latestSandboxRun?.status === "string" ? latestSandboxRun.status : null,
    previewImageUrl: latestRun?.preview_image_url ?? null,
    isFavorited: Boolean(favorite),
    stats: {
      viewCount: Number((stats as { view_count?: number } | null)?.view_count ?? 0) + 1,
      cloneCount: Number((stats as { clone_count?: number } | null)?.clone_count ?? 0)
    },
    creator: {
      name:
        typeof creator?.display_name === "string" && creator.display_name.trim()
          ? creator.display_name.trim()
          : typeof creator?.email === "string" && creator.email.trim()
            ? creator.email.trim()
            : "SMOTA 创作者",
      avatarUrl: typeof creator?.avatar_url === "string" ? creator.avatar_url : null
    }
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
