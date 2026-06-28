import type { ProjectRow } from "@smota/shared";

export interface SandboxRunPreviewRow {
  project_id: string;
  preview_url: string | null;
  preview_image_url?: string | null;
  updated_at: string;
}

export interface MyProjectCard {
  id: string;
  name: string;
  href: string;
  openUrl: string;
  previewImageUrl: string | null;
  updatedDate: string;
  published: boolean;
  showMenu: boolean;
  statusBadge: ProjectStatusBadge | null;
  creatorName?: string;
  creatorAvatarUrl?: string | null;
  viewCount?: number;
}

export interface SharedProjectCardMetadata {
  projectId: string;
  creatorName: string;
  creatorAvatarUrl?: string | null;
  viewCount: number;
}

export interface ProjectRunStatusRow {
  project_id: string;
  status: string;
  created_at: string;
}

export type ProjectStatusBadge = "published" | "developing";

export type ProjectCardMenuItem = {
  label: "在浏览器打开" | "复制链接" | "删除";
  action: "open" | "copy" | "delete";
};

export type ProjectCardMenuPlacement = "below" | "above";

export function formatProjectCardDate(value: string) {
  const date = new Date(value);
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");

  return `${year}/${month}/${day}`;
}

export function groupLatestSandboxRunsByProject(runs: SandboxRunPreviewRow[]) {
  const latestByProject = new Map<string, SandboxRunPreviewRow>();

  for (const run of runs) {
    const existing = latestByProject.get(run.project_id);
    if (!existing || new Date(run.updated_at).getTime() > new Date(existing.updated_at).getTime()) {
      latestByProject.set(run.project_id, run);
    }
  }

  return [...latestByProject.values()];
}

function isTerminalRunStatus(status: string) {
  return status === "succeeded" || status === "failed";
}

export function getDevelopingProjectIds(runs: ProjectRunStatusRow[]): Set<string> {
  return new Set(runs.filter((run) => !isTerminalRunStatus(run.status)).map((run) => run.project_id));
}

export function toProjectCards(projects: ProjectRow[], runs: SandboxRunPreviewRow[] = [], agentRuns: ProjectRunStatusRow[] = []): MyProjectCard[] {
  const latestRunByProject = new Map(groupLatestSandboxRunsByProject(runs).map((run) => [run.project_id, run]));
  const developingProjectIds = getDevelopingProjectIds(agentRuns);

  return projects.map((project) => {
    const href = `/projects/${project.id}`;
    const latestRun = latestRunByProject.get(project.id);
    const previewUrl = latestRun?.preview_url?.trim() || "";
    const statusBadge: ProjectStatusBadge | null = developingProjectIds.has(project.id) ? "developing" : previewUrl ? "published" : null;

    return {
      id: project.id,
      name: project.name?.trim() || "未命名项目",
      href,
      openUrl: previewUrl || href,
      previewImageUrl: latestRun?.preview_image_url?.trim() || null,
      updatedDate: formatProjectCardDate(project.updated_at),
      published: Boolean(previewUrl),
      showMenu: true,
      statusBadge
    };
  });
}

export function getStableSharedProjectIds(runs: ProjectRunStatusRow[]): Set<string> {
  const latestRunByProject = new Map<string, ProjectRunStatusRow>();

  for (const run of runs) {
    const existing = latestRunByProject.get(run.project_id);
    if (!existing || new Date(run.created_at).getTime() > new Date(existing.created_at).getTime()) {
      latestRunByProject.set(run.project_id, run);
    }
  }

  return new Set(
    [...latestRunByProject.values()]
      .filter((run) => run.status === "succeeded" || run.status === "failed")
      .map((run) => run.project_id)
  );
}

export function toDiscoveryProjectCards(
  projects: ProjectRow[],
  runs: SandboxRunPreviewRow[] = [],
  metadata: SharedProjectCardMetadata[] = []
): MyProjectCard[] {
  const latestRunByProject = new Map(groupLatestSandboxRunsByProject(runs).map((run) => [run.project_id, run]));
  const metadataByProject = new Map(metadata.map((item) => [item.projectId, item]));

  return projects.map((project) => {
    const href = `/share/${project.id}`;
    const latestRun = latestRunByProject.get(project.id);
    const previewUrl = latestRun?.preview_url?.trim() || "";
    const cardMetadata = metadataByProject.get(project.id);

    return {
      id: project.id,
      name: project.name?.trim() || "未命名项目",
      href,
      openUrl: previewUrl || href,
      previewImageUrl: latestRun?.preview_image_url?.trim() || null,
      updatedDate: formatProjectCardDate(project.updated_at),
      published: Boolean(previewUrl),
      showMenu: false,
      statusBadge: null,
      creatorName: cardMetadata?.creatorName,
      creatorAvatarUrl: cardMetadata?.creatorAvatarUrl ?? null,
      viewCount: cardMetadata?.viewCount
    };
  });
}

export function getProjectCardMenuItems(): ProjectCardMenuItem[] {
  return [
    { label: "在浏览器打开", action: "open" },
    { label: "复制链接", action: "copy" },
    { label: "删除", action: "delete" }
  ];
}

export function getMyProjectsGridClass() {
  return "grid grid-cols-[repeat(auto-fill,360px)] gap-5";
}

export function getProjectCardShellClass(menuOpen: boolean) {
  return [
    "relative w-[360px] overflow-visible rounded-lg border border-border bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-soft",
    menuOpen ? "z-30" : "z-0"
  ].join(" ");
}

export function getProjectCardMenuClass(placement: ProjectCardMenuPlacement) {
  return [
    "absolute right-4 z-50 w-48 rounded-lg border border-border bg-white p-2 text-sm shadow-xl",
    placement === "above" ? "bottom-16" : "top-16"
  ].join(" ");
}

export function getProjectStatusBadgeClass(status: ProjectStatusBadge) {
  const tone = status === "developing" ? "bg-amber-500/95 shadow-amber-200/50" : "bg-primary/90 shadow-primary/20";
  return `absolute -top-14 left-5 inline-flex items-center gap-1.5 rounded-full ${tone} px-3 py-1.5 text-xs font-semibold text-white shadow-sm`;
}

export function getPreviewPlaceholderClasses() {
  return {
    surface: "relative aspect-video overflow-hidden rounded-t-lg border-b border-slate-200 bg-slate-100",
    artwork:
      "absolute inset-0 opacity-80 [background-image:linear-gradient(135deg,rgba(97,87,255,0.12)_0_1px,transparent_1px_42px),repeating-linear-gradient(0deg,transparent_0_27px,rgba(148,163,184,0.22)_28px_29px),repeating-linear-gradient(90deg,transparent_0_35px,rgba(148,163,184,0.18)_36px_37px)]",
    wash: "absolute inset-0 bg-gradient-to-br from-white/80 via-white/35 to-slate-200/50"
  };
}

export function shouldCloseProjectMenuOnPointerDown({
  menuOpen,
  clickInsideMenu,
  clickInsideTrigger
}: {
  menuOpen: boolean;
  clickInsideMenu: boolean;
  clickInsideTrigger: boolean;
}) {
  return menuOpen && !clickInsideMenu && !clickInsideTrigger;
}

export function getDeleteConfirmationOverlayClass() {
  return "fixed inset-0 z-50 flex items-center justify-center bg-slate-950/20 px-4 backdrop-blur-sm";
}

export function shouldPlaceProjectMenuAbove({
  triggerTop,
  triggerBottom,
  viewportHeight,
  menuHeight,
  margin = 16
}: {
  triggerTop: number;
  triggerBottom: number;
  viewportHeight: number;
  menuHeight: number;
  margin?: number;
}) {
  const availableBelow = viewportHeight - triggerBottom - margin;
  const availableAbove = triggerTop - margin;

  return availableBelow < menuHeight && availableAbove > availableBelow;
}
