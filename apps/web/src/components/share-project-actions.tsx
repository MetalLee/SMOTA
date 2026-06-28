"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Bookmark, Copy, ExternalLink, GitFork, Loader2, X } from "lucide-react";
import { cloneSharedProjectAction, toggleFavoriteProjectAction } from "@/app/actions/projects";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function ShareProjectActions({
  projectId,
  projectName,
  previewUrl,
  isFavorited
}: {
  projectId: string;
  projectName: string;
  previewUrl: string | null;
  isFavorited: boolean;
}) {
  const router = useRouter();
  const [favorite, setFavorite] = useState(isFavorited);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const [cloneDialogOpen, setCloneDialogOpen] = useState(false);
  const [cloneName, setCloneName] = useState(`${projectName}（克隆）`);
  const [cloneError, setCloneError] = useState<string | null>(null);
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
    if (!previewUrl) {
      setCopyState("failed");
      return;
    }

    try {
      await navigator.clipboard.writeText(previewUrl);
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
    formData.set("projectName", cloneName);
    setCloneError(null);
    startCloneTransition(async () => {
      try {
        const result = await cloneSharedProjectAction(formData);
        router.push(`/projects/${result.projectId}`);
      } catch (error) {
        setCloneError(error instanceof Error ? error.message : "克隆失败，请稍后重试。");
      }
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
      <Button type="button" disabled={clonePending} className="h-11 rounded-full px-5" onClick={() => setCloneDialogOpen(true)}>
        <GitFork className="h-4 w-4" />
        克隆
      </Button>
      {copyState !== "idle" ? <span className={copyState === "copied" ? "text-sm text-slate-500" : "text-sm text-red-600"}>{copyState === "copied" ? "链接已复制" : "复制失败"}</span> : null}
      {cloneDialogOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/20 px-4 backdrop-blur-sm" role="dialog" aria-modal="true">
          <div className="w-full max-w-2xl rounded-lg border border-border bg-white p-8 shadow-xl">
            <div className="flex items-start justify-between gap-6">
              <div>
                <h2 className="text-2xl font-bold text-ink">从当前版本重新制作</h2>
                <p className="mt-7 text-base leading-7 text-slate-600">获取相同版本并在新项目中继续编辑。</p>
                <p className="text-base leading-7 text-slate-600">您可以重命名项目或保持原样。</p>
              </div>
              <button
                type="button"
                className="flex h-9 w-9 items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-100 hover:text-ink"
                onClick={() => {
                  if (!clonePending) setCloneDialogOpen(false);
                }}
                aria-label="关闭"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <label className="mt-6 block text-sm font-medium text-slate-700" htmlFor="clone-project-name">
              项目名称
            </label>
            <Input
              id="clone-project-name"
              className="mt-3 h-14 rounded-lg border-primary text-base"
              value={cloneName}
              disabled={clonePending}
              onChange={(event) => setCloneName(event.target.value)}
            />
            {cloneError ? <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">{cloneError}</div> : null}
            <div className="mt-8 flex justify-end gap-3">
              <Button
                type="button"
                disabled={clonePending}
                className="h-12 rounded-lg bg-slate-100 px-6 text-base text-slate-700 shadow-none hover:bg-slate-200"
                onClick={() => setCloneDialogOpen(false)}
              >
                取消
              </Button>
              <Button type="button" disabled={clonePending} className="h-12 rounded-lg px-6 text-base" onClick={cloneProject}>
                {clonePending ? <Loader2 className="h-4 w-4 animate-spin" /> : <GitFork className="h-4 w-4" />}
                克隆
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
