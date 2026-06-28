export type ResourceTabKey = "discover" | "templates";

export interface ShareableProjectInput {
  runStatus: string;
  sandboxStatus: string | null | undefined;
  previewUrl: string | null | undefined;
}

export interface ShareStatsInput {
  viewCount: number;
  cloneCount: number;
}

export function isProjectShareable(input: ShareableProjectInput) {
  return input.runStatus === "succeeded" && input.sandboxStatus === "previewing" && Boolean(input.previewUrl?.trim());
}

export function buildProjectShareUrl(origin: string, projectId: string) {
  const base = origin.replace(/\/$/, "");
  return `${base}/share/${projectId}`;
}

export function normalizeResourceTab(value: string | null | undefined): ResourceTabKey {
  return value === "templates" ? "templates" : "discover";
}

export function getResourceTabs(): Array<{ key: ResourceTabKey; label: string }> {
  return [
    { key: "discover", label: "发现" },
    { key: "templates", label: "模板" }
  ];
}

export function getShareActionItems(): Array<{ action: "open" | "copy"; label: string }> {
  return [
    { action: "open", label: "在浏览器打开" },
    { action: "copy", label: "复制链接" }
  ];
}

export function getShareStatsLabels(input: ShareStatsInput) {
  return [`浏览人数 ${input.viewCount}`, `克隆次数 ${input.cloneCount}`];
}
