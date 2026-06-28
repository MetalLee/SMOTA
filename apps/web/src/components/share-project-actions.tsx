"use client";

import { useMemo, useState, useTransition } from "react";
import { Bookmark, Copy, ExternalLink, GitFork, Loader2 } from "lucide-react";
import { cloneSharedProjectAction, toggleFavoriteProjectAction } from "@/app/actions/projects";
import { Button } from "@/components/ui/button";

export function ShareProjectActions({
  projectId,
  previewUrl,
  shareUrl,
  isFavorited
}: {
  projectId: string;
  previewUrl: string | null;
  shareUrl: string;
  isFavorited: boolean;
}) {
  const [favorite, setFavorite] = useState(isFavorited);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const [favoritePending, startFavoriteTransition] = useTransition();
  const [clonePending, startCloneTransition] = useTransition();
  const favoriteLabel = favorite ? "已收藏" : "收藏";
  const canOpen = Boolean(previewUrl);
  const favoriteFormData = useMemo(() => {
    const formData = new FormData();
    formData.set("projectId", projectId);
    formData.set("favorite", String(!favorite));
    return formData;
  }, [favorite, projectId]);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
  }

  function toggleFavorite() {
    if (favoritePending) return;
    startFavoriteTransition(async () => {
      await toggleFavoriteProjectAction(favoriteFormData);
      setFavorite((current) => !current);
    });
  }

  function cloneProject() {
    if (clonePending) return;
    const formData = new FormData();
    formData.set("projectId", projectId);
    startCloneTransition(async () => {
      await cloneSharedProjectAction(formData);
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button
        type="button"
        disabled={!canOpen}
        className="h-11 rounded-full bg-slate-100 px-4 text-slate-700 shadow-none hover:bg-slate-200 disabled:bg-slate-100"
        onClick={() => {
          if (previewUrl) window.open(previewUrl, "_blank", "noopener,noreferrer");
        }}
      >
        <ExternalLink className="h-4 w-4" />
        在浏览器打开
      </Button>
      <Button type="button" className="h-11 rounded-full bg-slate-100 px-4 text-slate-700 shadow-none hover:bg-slate-200" onClick={copyLink}>
        <Copy className="h-4 w-4" />
        复制链接
      </Button>
      <Button
        type="button"
        disabled={favoritePending}
        className="h-11 rounded-full bg-slate-100 px-4 text-slate-700 shadow-none hover:bg-slate-200 disabled:bg-slate-100"
        onClick={toggleFavorite}
      >
        {favoritePending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bookmark className="h-4 w-4" />}
        {favoriteLabel}
      </Button>
      <Button type="button" disabled={clonePending} className="h-11 rounded-full px-5" onClick={cloneProject}>
        {clonePending ? <Loader2 className="h-4 w-4 animate-spin" /> : <GitFork className="h-4 w-4" />}
        克隆
      </Button>
      {copyState !== "idle" ? <span className={copyState === "copied" ? "text-sm text-slate-500" : "text-sm text-red-600"}>{copyState === "copied" ? "链接已复制" : "复制失败"}</span> : null}
    </div>
  );
}
