"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Copy, ExternalLink, Eye, Globe2, Loader2, MoreHorizontal, Trash2 } from "lucide-react";
import { deleteProjectAction } from "@/app/actions/projects";
import { RouteLoadingLink } from "@/components/route-loading";
import { Button } from "@/components/ui/button";
import {
  getPreviewPlaceholderClasses,
  getDeleteConfirmationOverlayClass,
  getProjectCardMenuClass,
  getProjectCardMenuItems,
  getProjectCardShellClass,
  getPublishedBadgeClass,
  shouldCloseProjectMenuOnPointerDown,
  shouldPlaceProjectMenuAbove,
  type ProjectCardMenuPlacement,
  type MyProjectCard as MyProjectCardModel
} from "@/lib/my-projects";
import { cn } from "@/lib/utils";

function copyTargetUrl(openUrl: string) {
  if (openUrl.startsWith("http")) {
    return openUrl;
  }

  return new URL(openUrl, window.location.origin).toString();
}

function PreviewPlaceholder() {
  const classes = getPreviewPlaceholderClasses();

  return (
    <div className={classes.surface} aria-hidden="true">
      <div className={classes.artwork} />
      <div className={classes.wash} />
    </div>
  );
}

function CreatorAvatar({ name, src }: { name: string; src?: string | null }) {
  if (src) {
    return <img className="h-12 w-12 rounded-full object-cover" src={src} alt={`${name} 头像`} />;
  }

  return (
    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-slate-700 text-lg font-bold text-white">
      {name.slice(0, 1).toUpperCase()}
    </div>
  );
}

export function MyProjectCard({ project }: { project: MyProjectCardModel }) {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const [menuPlacement, setMenuPlacement] = useState<ProjectCardMenuPlacement>("below");
  const [isPending, startTransition] = useTransition();
  const menuItems = useMemo(() => getProjectCardMenuItems(), []);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const menuButtonRef = useRef<HTMLButtonElement | null>(null);
  const isSharedCard = !project.showMenu;
  const creatorName = project.creatorName?.trim() || "SMOTA 创作者";
  const viewCount = project.viewCount ?? 0;

  useEffect(() => {
    if (!menuOpen) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      const target = event.target;
      if (!(target instanceof Node)) {
        return;
      }

      const clickInsideMenu = Boolean(menuRef.current?.contains(target));
      const clickInsideTrigger = Boolean(menuButtonRef.current?.contains(target));

      if (shouldCloseProjectMenuOnPointerDown({ menuOpen: true, clickInsideMenu, clickInsideTrigger })) {
        setMenuOpen(false);
        setCopyState("idle");
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [menuOpen]);

  useLayoutEffect(() => {
    if (!menuOpen || !menuButtonRef.current || !menuRef.current) {
      return;
    }

    const triggerRect = menuButtonRef.current.getBoundingClientRect();
    const menuHeight = menuRef.current.offsetHeight;
    const placeAbove = shouldPlaceProjectMenuAbove({
      triggerTop: triggerRect.top,
      triggerBottom: triggerRect.bottom,
      viewportHeight: window.innerHeight,
      menuHeight
    });

    setMenuPlacement(placeAbove ? "above" : "below");
  }, [menuOpen]);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(copyTargetUrl(project.openUrl));
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
  }

  function deleteProject() {
    const formData = new FormData();
    formData.set("projectId", project.id);

    startTransition(async () => {
      await deleteProjectAction(formData);
      setConfirmOpen(false);
      router.refresh();
    });
  }

  return (
    <article className={getProjectCardShellClass(menuOpen)}>
      <RouteLoadingLink href={project.href} aria-label={`打开项目 ${project.name}`}>
        {project.previewImageUrl ? (
          <div className="aspect-video overflow-hidden rounded-t-lg border-b border-slate-200 bg-slate-100">
            <img className="h-full w-full object-cover" src={project.previewImageUrl} alt={`${project.name} 预览图`} />
          </div>
        ) : (
          <PreviewPlaceholder />
        )}
      </RouteLoadingLink>

      <div className={cn("relative min-h-28 p-5", project.showMenu ? "pr-14" : "pr-5")}>
        {project.showPublishedBadge && project.published ? (
          <div className={getPublishedBadgeClass()}>
            <Globe2 className="h-3.5 w-3.5" />
            已发布
          </div>
        ) : null}

        {isSharedCard ? (
          <div className="flex items-center gap-4">
            <CreatorAvatar name={creatorName} src={project.creatorAvatarUrl} />
            <div className="min-w-0">
              <RouteLoadingLink href={project.href} className="block truncate text-base font-bold text-ink transition hover:text-primary">
                {project.name}
              </RouteLoadingLink>
              <div className="mt-2 flex items-center gap-2 text-sm text-slate-500">
                <span className="truncate">{creatorName}</span>
                <span className="text-slate-300">•</span>
                <span className="inline-flex items-center gap-1">
                  <Eye className="h-4 w-4" />
                  {viewCount}
                </span>
              </div>
            </div>
          </div>
        ) : (
          <>
            <RouteLoadingLink href={project.href} className="block truncate text-base font-bold text-ink transition hover:text-primary">
              {project.name}
            </RouteLoadingLink>
            <div className="mt-1 text-sm text-slate-500">{project.updatedDate}</div>
          </>
        )}

        {project.showMenu ? (
          <button
            ref={menuButtonRef}
            type="button"
            aria-label={`${project.name} 项目操作`}
            aria-expanded={menuOpen}
            className="absolute bottom-5 right-4 flex h-9 w-9 items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-100 hover:text-ink"
            onClick={() => {
              setMenuOpen((open) => !open);
              setCopyState("idle");
              setMenuPlacement("below");
            }}
          >
            <MoreHorizontal className="h-5 w-5" />
          </button>
        ) : null}

        {project.showMenu && menuOpen ? (
          <div ref={menuRef} className={getProjectCardMenuClass(menuPlacement)}>
            {menuItems.map((item) => {
              if (item.action === "open") {
                return (
                  <button
                    key={item.action}
                    type="button"
                    className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-slate-700 transition hover:bg-slate-50 hover:text-ink"
                    onClick={() => {
                      window.open(project.openUrl, "_blank", "noopener,noreferrer");
                      setMenuOpen(false);
                    }}
                  >
                    <ExternalLink className="h-4 w-4" />
                    {item.label}
                  </button>
                );
              }

              if (item.action === "copy") {
                return (
                  <button
                    key={item.action}
                    type="button"
                    className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-slate-700 transition hover:bg-slate-50 hover:text-ink"
                    onClick={copyLink}
                  >
                    <Copy className="h-4 w-4" />
                    {item.label}
                  </button>
                );
              }

              return (
                <button
                  key={item.action}
                  type="button"
                  className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-red-600 transition hover:bg-red-50"
                  onClick={() => {
                    setMenuOpen(false);
                    setConfirmOpen(true);
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                  {item.label}
                </button>
              );
            })}
            {copyState !== "idle" ? (
              <div className={cn("px-3 pb-1 pt-2 text-xs", copyState === "copied" ? "text-slate-500" : "text-red-600")}>
                {copyState === "copied" ? "链接已复制" : "复制失败"}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      {confirmOpen
        ? createPortal(
            <div className={getDeleteConfirmationOverlayClass()} role="dialog" aria-modal="true">
          <div className="w-full max-w-sm rounded-lg border border-border bg-white p-5 shadow-xl">
            <div className="text-base font-bold text-ink">删除项目？</div>
            <p className="mt-2 text-sm leading-6 text-slate-500">删除后项目和相关运行记录会从列表移除。此操作不可直接撤销。</p>
            <div className="mt-5 flex justify-end gap-2">
              <Button
                type="button"
                className="border-border bg-white text-slate-700 shadow-none hover:bg-slate-50 disabled:bg-slate-100"
                disabled={isPending}
                onClick={() => setConfirmOpen(false)}
              >
                取消
              </Button>
              <Button type="button" className="bg-red-600 hover:bg-red-700" disabled={isPending} onClick={deleteProject}>
                {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                删除
              </Button>
            </div>
          </div>
            </div>,
            document.body
          )
        : null}
    </article>
  );
}
