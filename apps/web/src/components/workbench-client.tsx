"use client";

import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import ReactMarkdown from "react-markdown";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  Bot,
  CheckCircle2,
  ChevronRight,
  Circle,
  Clock,
  Copy,
  ExternalLink,
  File,
  FileText,
  Folder,
  FolderOpen,
  Loader2,
  Monitor,
  PanelRight,
  Play,
  RefreshCw,
  Send,
  Share2,
  Square,
  Terminal,
  UploadCloud,
  XCircle
} from "lucide-react";
import { approvePlanAction, continueProjectAction, updateProjectShareAction } from "@/app/actions/projects";
import { FileTreeTable } from "@/components/file-tree-table";
import { PendingButton } from "@/components/pending-button";
import { LoadingOverlay, RouteLoadingLink, WorkspaceLoadingLink } from "@/components/route-loading";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { canStartContinuationRun, shouldAutoStartPlanning, shouldAutoStartSandbox } from "@/lib/project-planning";
import { buildProjectShareUrl, getShareActionItems, isProjectShareable } from "@/lib/project-sharing";
import { cn } from "@/lib/utils";
import {
  buildFileTree,
  getAgentDisplayStates,
  getAgentDurationLabels,
  getAgentEventProgress,
  getDashboardHref,
  getEditorLanguage,
  getExpandedDirectorySet,
  getLatestRunEventCursor,
  getFileContentErrorLabel,
  getLoadingOverlayClasses,
  getLocalizedStatusLabel,
  getWorkbenchTabs,
  mergeRunEvents,
  shouldReloadRunEvents,
  getRealtimeTabEmptyState,
  getRunControls,
  getTaskDisplayItems,
  getWorkbenchHeaderActions,
  getWorkbenchLayoutClasses,
  shouldEnsurePreviewServer,
  shouldShowWorkspaceNavigationOverlay,
  stripOuterMarkdownFence,
  type AgentDisplayName,
  type FileTreeNode
} from "@/lib/workbench";
import type { AgentRunRow, ArtifactRow, ProjectRow, RunEventRow, TaskRow, WorkspaceFileRow } from "@smota/shared";

const MonacoEditor = dynamic(() => import("@monaco-editor/react"), {
  ssr: false,
  loading: () => <div className="flex h-full items-center justify-center text-sm text-slate-400">Loading editor...</div>
});

const agents: AgentDisplayName[] = ["ProductAgent", "ArchitectAgent", "PlannerAgent", "CodingAgent", "BuildAgent", "ReviewerAgent"];
const tabIcons = {
  plan: FileText,
  preview: Monitor,
  editor: PanelRight,
  terminal: Terminal,
  files: FileText
};
const tabs = getWorkbenchTabs();

interface SandboxRunSnapshot {
  status: string;
  preview_url: string | null;
  last_error: string | null;
}

interface WorkbenchClientProps {
  initialProject: ProjectRow;
  initialRun: AgentRunRow;
  initialArtifacts: ArtifactRow[];
  initialTasks: TaskRow[];
  initialEvents: RunEventRow[];
  initialFiles: WorkspaceFileRow[];
  initialActiveTab: string;
  initialFilePath?: string;
}

export function WorkbenchClient({
  initialProject,
  initialRun,
  initialArtifacts,
  initialTasks,
  initialEvents,
  initialFiles,
  initialActiveTab,
  initialFilePath
}: WorkbenchClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [project, setProject] = useState(initialProject);
  const [run, setRun] = useState(initialRun);
  const [artifacts, setArtifacts] = useState(initialArtifacts);
  const [tasks, setTasks] = useState(initialTasks);
  const [events, setEvents] = useState(initialEvents);
  const eventsRef = useRef(initialEvents);
  const [files, setFiles] = useState(initialFiles);
  const [sandboxRun, setSandboxRun] = useState<SandboxRunSnapshot | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [loadingAction, setLoadingAction] = useState<"start" | "stop" | null>(null);
  const [previewRefreshing, setPreviewRefreshing] = useState(false);
  const [previewReloadNonce, setPreviewReloadNonce] = useState(0);
  const [workspaceNavigating, setWorkspaceNavigating] = useState(false);
  const [planningStarted, setPlanningStarted] = useState(false);
  const [sandboxAutoStarted, setSandboxAutoStarted] = useState(false);
  const [continuationSubmitting, setContinuationSubmitting] = useState(false);
  const [, startRefreshTransition] = useTransition();
  const previewRecoveryRef = useRef<{
    previewUrl: string | null;
    lastAttemptAt: number | null;
    inFlight: boolean;
    forceNext: boolean;
  }>({ previewUrl: null, lastAttemptAt: null, inFlight: false, forceNext: false });

  const queryTab = searchParams.get("tab") ?? initialActiveTab;
  const activeTab = tabs.some((tab) => tab.key === queryTab) ? queryTab : "plan";
  const selectedFilePath = searchParams.get("file") ?? initialFilePath ?? files[0]?.path ?? "";
  const controls = getRunControls(run.status, run.sandbox_status);
  const layoutClasses = getWorkbenchLayoutClasses();
  const overlayClasses = getLoadingOverlayClasses();
  const headerActions = getWorkbenchHeaderActions();
  const currentPreviewUrl = run.sandbox_preview_url ?? sandboxRun?.preview_url ?? null;
  const shareable = isProjectShareable({ runStatus: run.status, sandboxStatus: run.sandbox_status ?? sandboxRun?.status, previewUrl: currentPreviewUrl });

  const refreshWorkspace = useCallback(async () => {
    const requestedRunId = run.id;
    const latestEventCursor = getLatestRunEventCursor(eventsRef.current);
    const eventsUrl = latestEventCursor
      ? `/api/runs/${requestedRunId}/events?after=${encodeURIComponent(latestEventCursor)}`
      : `/api/runs/${requestedRunId}/events`;
    const previewUrl = run.sandbox_preview_url ?? sandboxRun?.preview_url ?? null;
    const recoveryState = previewRecoveryRef.current;
    if (recoveryState.previewUrl !== previewUrl) {
      recoveryState.previewUrl = previewUrl;
      recoveryState.lastAttemptAt = null;
      recoveryState.inFlight = false;
      recoveryState.forceNext = false;
    }
    const shouldEnsurePreview = shouldEnsurePreviewServer({
      activeTab,
      previewUrl,
      inFlight: recoveryState.inFlight,
      lastAttemptAt: recoveryState.forceNext ? null : recoveryState.lastAttemptAt,
      cooldownMs: Number.POSITIVE_INFINITY
    });
    const forceEnsurePreview = recoveryState.forceNext;
    recoveryState.forceNext = false;
    const statusRequest = shouldEnsurePreview
      ? (() => {
          recoveryState.inFlight = true;
          recoveryState.lastAttemptAt = Date.now();
          const suffix = forceEnsurePreview ? "&force=1" : "";
          return fetch(`/api/runs/${run.id}/sandbox/status?ensurePreview=1${suffix}`, { cache: "no-store" }).finally(() => {
            recoveryState.inFlight = false;
          });
        })()
      : Promise.resolve(null);
    const [workspaceResponse, eventsResponse, statusResponse] = await Promise.all([
      fetch(`/api/projects/${project.id}/workspace`, { cache: "no-store" }),
      fetch(eventsUrl, { cache: "no-store" }),
      statusRequest
    ]);

    if (workspaceResponse.ok) {
      const payload = (await workspaceResponse.json()) as {
        project: ProjectRow;
        run: AgentRunRow;
        tasks: TaskRow[];
        artifacts: ArtifactRow[];
        files: WorkspaceFileRow[];
        sandboxRun: SandboxRunSnapshot | null;
      };
      setProject(payload.project);
      setRun(payload.run);
      setTasks(payload.tasks);
      setArtifacts(payload.artifacts);
      setFiles(payload.files);
      setSandboxRun(payload.sandboxRun);
      if (shouldReloadRunEvents(requestedRunId, payload.run.id)) {
        const nextEventsResponse = await fetch(`/api/runs/${payload.run.id}/events`, { cache: "no-store" });
        if (nextEventsResponse.ok) {
          const nextEventsPayload = (await nextEventsResponse.json()) as { events: RunEventRow[] };
          eventsRef.current = nextEventsPayload.events;
          setEvents(nextEventsPayload.events);
        } else {
          eventsRef.current = [];
          setEvents([]);
        }
        return;
      }
    }

    if (eventsResponse.ok) {
      const payload = (await eventsResponse.json()) as { events: RunEventRow[] };
      setEvents((currentEvents) => {
        const mergedEvents = mergeRunEvents(currentEvents, payload.events);
        eventsRef.current = mergedEvents;
        return mergedEvents;
      });
    }

    if (statusResponse?.ok) {
      const payload = (await statusResponse.json()) as { run: AgentRunRow; sandboxRun: SandboxRunSnapshot | null; previewRecovered?: boolean };
      setRun(payload.run);
      setSandboxRun(payload.sandboxRun);
      if (payload.previewRecovered) {
        setPreviewReloadNonce((value) => value + 1);
      }
    }
  }, [activeTab, project.id, run.id, run.sandbox_preview_url, sandboxRun?.preview_url]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      void refreshWorkspace();
    }, 3000);
    return () => window.clearInterval(interval);
  }, [refreshWorkspace]);

  useEffect(() => {
    setPlanningStarted(false);
    setSandboxAutoStarted(false);
  }, [run.id]);

  useEffect(() => {
    if (planningStarted || !shouldAutoStartPlanning(run.status, run.current_step)) {
      return;
    }

    setPlanningStarted(true);
    void fetch(`/api/runs/${run.id}/planning/start`, { method: "POST" }).finally(() => {
      void refreshWorkspace();
    });
  }, [planningStarted, refreshWorkspace, run.current_step, run.id, run.status]);

  const sandboxAutoStartPending = shouldAutoStartSandbox(run.status, run.current_step);

  async function startSandbox() {
    if (loadingAction !== null) return;
    setLoadingAction("start");
    setActionError(null);
    const response = await fetch(`/api/runs/${run.id}/sandbox/start`, { method: "POST" });
    const payload = (await response.json().catch(() => ({}))) as { error?: string; reason?: string };
    if (!response.ok || payload.error || payload.reason) {
      setActionError(payload.error ?? payload.reason ?? "Sandbox build failed.");
    }
    setLoadingAction(null);
    await refreshWorkspace();
  }

  useEffect(() => {
    if (sandboxAutoStarted || !sandboxAutoStartPending) {
      return;
    }

    setSandboxAutoStarted(true);
    void startSandbox();
  }, [sandboxAutoStartPending, sandboxAutoStarted]);

  async function stopSandbox() {
    if (loadingAction !== null) return;
    setLoadingAction("stop");
    setActionError(null);
    const response = await fetch(`/api/runs/${run.id}/sandbox/stop`, { method: "POST" });
    const payload = (await response.json().catch(() => ({}))) as { error?: string };
    if (!response.ok || payload.error) {
      setActionError(payload.error ?? "Unable to stop Sandbox.");
    }
    setLoadingAction(null);
    await refreshWorkspace();
  }

  async function refreshAll() {
    if (previewRefreshing) return;
    setPreviewRefreshing(true);
    previewRecoveryRef.current.forceNext = true;
    startRefreshTransition(() => {
      router.refresh();
    });
    await refreshWorkspace();
    setPreviewRefreshing(false);
  }

  async function continueProject(prompt: string) {
    if (continuationSubmitting || !canStartContinuationRun(run.status)) return;
    setContinuationSubmitting(true);
    setActionError(null);
    const formData = new FormData();
    formData.set("projectId", project.id);
    formData.set("runId", run.id);
    formData.set("prompt", prompt);

    try {
      await continueProjectAction(formData);
      await refreshWorkspace();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "创建继续开发 Run 失败。");
    } finally {
      setContinuationSubmitting(false);
    }
  }

  useEffect(() => {
    setWorkspaceNavigating(false);
  }, [activeTab, selectedFilePath]);

  return (
    <div className={layoutClasses.root}>
      <aside className={layoutClasses.sidebar}>
        <AgentPanel
          project={project}
          run={run}
          tasks={tasks}
          events={events}
          controls={controls}
          loadingAction={loadingAction}
          continuationSubmitting={continuationSubmitting}
          sandboxAutoStartPending={sandboxAutoStartPending}
          actionError={actionError}
          canContinue={canStartContinuationRun(run.status)}
          onContinue={continueProject}
          onStart={startSandbox}
          onStop={stopSandbox}
          layoutClasses={layoutClasses}
        />
      </aside>

      <main className={layoutClasses.main}>
        <header className="flex h-16 items-center justify-between border-b border-border bg-white px-5">
          <nav className="flex items-center gap-1">
            {tabs.map(({ key, label }) => {
              const Icon = tabIcons[key];
              const nextFilePath = key === "editor" ? selectedFilePath : "";

              return (
                <WorkspaceLoadingLink
                  key={key}
                  href={`/projects/${project.id}?tab=${key}${nextFilePath ? `&file=${encodeURIComponent(nextFilePath)}` : ""}`}
                  onNavigateStart={() => {
                    if (shouldShowWorkspaceNavigationOverlay(activeTab, key, activeTab === "editor" ? selectedFilePath : "", nextFilePath)) {
                      setWorkspaceNavigating(true);
                    }
                  }}
                  className={cn(
                    "flex h-9 items-center gap-2 rounded-lg px-3 text-sm font-medium text-slate-500",
                    activeTab === key && "bg-slate-100 text-ink"
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </WorkspaceLoadingLink>
              );
            })}
          </nav>
          <WorkbenchHeaderShareActions project={project} previewUrl={currentPreviewUrl} shareable={shareable} headerActions={headerActions} />
        </header>

        <section className={cn(layoutClasses.content, "relative")}>
          {activeTab === "plan" ? <PlanTab artifacts={artifacts} /> : null}
          {activeTab === "terminal" ? <TerminalTab events={events} /> : null}
          {activeTab === "files" ? <FilesTab projectId={project.id} files={files} sandboxStatus={run.sandbox_status ?? sandboxRun?.status ?? null} onNavigateStart={() => setWorkspaceNavigating(true)} /> : null}
          {activeTab === "editor" ? <EditorTab projectId={project.id} filePath={selectedFilePath} files={files} sandboxStatus={run.sandbox_status ?? sandboxRun?.status ?? null} /> : null}
          {activeTab === "preview" ? <PreviewTab run={run} sandboxRun={sandboxRun} previewReloadNonce={previewReloadNonce} onRefresh={refreshAll} refreshing={previewRefreshing} /> : null}
          {workspaceNavigating ? <LoadingOverlay className={overlayClasses.workspaceOverlay} label="正在加载工作区" /> : null}
        </section>
      </main>
    </div>
  );
}

function WorkbenchHeaderShareActions({
  project,
  previewUrl,
  shareable,
  headerActions
}: {
  project: ProjectRow;
  previewUrl: string | null;
  shareable: boolean;
  headerActions: ReturnType<typeof getWorkbenchHeaderActions>;
}) {
  const [shareOpen, setShareOpen] = useState(false);
  const [shared, setShared] = useState(project.is_shared_to_discovery ?? true);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const [pending, startTransition] = useTransition();
  const menuRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const shareActions = useMemo(() => getShareActionItems(), []);
  const shareUrl = typeof window === "undefined" ? `/share/${project.id}` : buildProjectShareUrl(window.location.origin, project.id);

  useEffect(() => {
    setShared(project.is_shared_to_discovery ?? true);
  }, [project.is_shared_to_discovery]);

  useEffect(() => {
    if (!shareOpen) return;

    function handlePointerDown(event: PointerEvent) {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (!menuRef.current?.contains(target) && !buttonRef.current?.contains(target)) {
        setShareOpen(false);
        setCopyState("idle");
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [shareOpen]);

  async function copyShareUrl() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
  }

  function setDiscoveryShare(nextShared: boolean) {
    if (pending) return;
    const previous = shared;
    setShared(nextShared);
    const formData = new FormData();
    formData.set("projectId", project.id);
    formData.set("shared", String(nextShared));
    startTransition(async () => {
      try {
        await updateProjectShareAction(formData);
      } catch {
        setShared(previous);
      }
    });
  }

  function publishProject() {
    setDiscoveryShare(true);
  }

  return (
    <div className="relative flex items-center gap-2">
      {headerActions.map((action) => {
        const Icon = action.id === "share" ? Share2 : UploadCloud;
        if (action.id === "publish") {
          return (
            <button
              key={action.id}
              type="button"
              disabled={!shareable || pending}
              className="flex h-9 items-center gap-2 rounded-lg border border-border px-3 text-sm font-medium text-slate-500 transition hover:bg-slate-50 hover:text-ink disabled:cursor-not-allowed disabled:text-slate-300"
              onClick={publishProject}
            >
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Icon className="h-4 w-4" />}
              {shareable && shared ? "已发布" : action.label}
            </button>
          );
        }

        return (
          <button
            key={action.id}
            ref={buttonRef}
            type="button"
            disabled={!shareable}
            aria-expanded={shareOpen}
            className="flex h-9 items-center gap-2 rounded-lg border border-border px-3 text-sm font-medium text-slate-500 transition hover:bg-slate-50 hover:text-ink disabled:cursor-not-allowed disabled:text-slate-300"
            onClick={() => {
              setShareOpen((open) => !open);
              setCopyState("idle");
            }}
          >
            <Icon className="h-4 w-4" />
            {action.label}
          </button>
        );
      })}

      {shareOpen ? (
        <div ref={menuRef} className="absolute right-0 top-11 z-50 w-72 rounded-lg border border-border bg-white p-2 text-sm shadow-xl">
          {shareActions.map((item) => (
            <button
              key={item.action}
              type="button"
              className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-slate-700 transition hover:bg-slate-50 hover:text-ink"
              onClick={() => {
                if (item.action === "open" && previewUrl) {
                  window.open(previewUrl, "_blank", "noopener,noreferrer");
                  setShareOpen(false);
                }
                if (item.action === "copy") void copyShareUrl();
              }}
            >
              {item.action === "open" ? <ExternalLink className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {item.label}
            </button>
          ))}
          <div className="mt-1 flex items-center justify-between rounded-md px-3 py-2.5 text-slate-700">
            <span>是否共享到「发现」中</span>
            <button
              type="button"
              role="switch"
              aria-checked={shared}
              disabled={pending}
              className={cn("relative h-6 w-11 rounded-full transition", shared ? "bg-primary" : "bg-slate-200", pending && "opacity-60")}
              onClick={() => setDiscoveryShare(!shared)}
            >
              <span className={cn("absolute top-1 h-4 w-4 rounded-full bg-white transition", shared ? "left-6" : "left-1")} />
            </button>
          </div>
          {copyState !== "idle" ? (
            <div className={cn("px-3 pb-1 pt-2 text-xs", copyState === "copied" ? "text-slate-500" : "text-red-600")}>
              {copyState === "copied" ? "链接已复制" : "复制失败"}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function AgentPanel({
  project,
  run,
  tasks,
  events,
  controls,
  loadingAction,
  continuationSubmitting,
  sandboxAutoStartPending,
  actionError,
  canContinue,
  onContinue,
  onStart,
  onStop,
  layoutClasses
}: {
  project: ProjectRow;
  run: AgentRunRow;
  tasks: TaskRow[];
  events: RunEventRow[];
  controls: ReturnType<typeof getRunControls>;
  loadingAction: "start" | "stop" | null;
  continuationSubmitting: boolean;
  sandboxAutoStartPending: boolean;
  actionError: string | null;
  canContinue: boolean;
  onContinue: (prompt: string) => Promise<void>;
  onStart: () => Promise<void>;
  onStop: () => Promise<void>;
  layoutClasses: ReturnType<typeof getWorkbenchLayoutClasses>;
}) {
  const [continuationPrompt, setContinuationPrompt] = useState("");
  const agentProgress = useMemo(() => getAgentEventProgress(events), [events]);
  const agentDurationLabels = useMemo(() => getAgentDurationLabels(events), [events]);
  const taskDisplayItems = useMemo(
    () => getTaskDisplayItems(tasks, run.status, run.sandbox_status, run.current_step),
    [run.current_step, run.sandbox_status, run.status, tasks]
  );
  const dashboardHref = getDashboardHref();
  const agentStates = useMemo(
    () =>
      getAgentDisplayStates({
        runStatus: run.status,
        currentStep: run.current_step,
        sandboxStatus: run.sandbox_status,
        buildStatus: run.build_status,
        eventAgentNames: agentProgress.completedAgentNames,
        activeAgentNames: agentProgress.activeAgentNames
      }),
    [agentProgress, run.build_status, run.current_step, run.sandbox_status, run.status]
  );

  return (
    <div className={layoutClasses.agentPanel}>
      <div className={layoutClasses.agentPanelSummary}>
        <div className="mb-6">
          <RouteLoadingLink className="mb-3 flex w-fit items-center gap-2 rounded-lg pr-3 transition hover:bg-slate-50" href={dashboardHref}>
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-sm font-bold text-white">S</div>
            <div className="text-sm font-bold">SMOTA</div>
          </RouteLoadingLink>
          <h1 className="text-xl font-bold">{project.name}</h1>
        </div>

        <div className="mb-4 grid grid-cols-2 gap-2">
          <StatusPill label="运行状态" value={getLocalizedStatusLabel(run.status)} />
          <StatusPill label="沙箱状态" value={getLocalizedStatusLabel(run.sandbox_status ?? "not_ready")} />
        </div>

        <div className="mb-6">
          <div className="mb-3 text-sm font-semibold text-slate-700">Agent时间线</div>
          <div className="space-y-2">
            {agents.map((agent) => {
              const displayStatus = agentStates[agent];
              const durationLabel = agentDurationLabels[agent] ?? "-";
              return (
                <div key={agent} className="flex items-center gap-3 rounded-lg border border-border bg-slate-50 px-3 py-2">
                  <div className="flex h-7 w-7 items-center justify-center rounded-full bg-white text-primary">
                    <Bot className="h-4 w-4" />
                  </div>
                  <span className="flex-1 text-sm font-medium text-slate-700">{agent}</span>
                  <span className="min-w-[3.5rem] text-right text-xs font-medium tabular-nums text-slate-400">{durationLabel}</span>
                  {displayStatus === "done" ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  ) : displayStatus === "in_progress" ? (
                    <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  ) : (
                    <Clock className="h-4 w-4 text-slate-300" />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="pb-6">
          <div className="mb-3 text-sm font-semibold text-slate-700">计划任务</div>
          <div className="space-y-3">
            {taskDisplayItems.map(({ task, displayStatus }) => {
              return (
                <div key={task.id} className="grid grid-cols-[20px_minmax(0,1fr)] gap-2 text-sm text-slate-600">
                  <div className="flex h-5 w-5 shrink-0 items-start justify-center pt-0.5">
                    {displayStatus === "done" ? (
                      <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
                    ) : displayStatus === "in_progress" ? (
                      <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" />
                    ) : (
                      <Circle className="h-4 w-4 shrink-0 text-slate-300" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="break-words font-medium leading-5 text-slate-700">{task.title}</div>
                    {task.description ? <div className="mt-0.5 break-words text-xs leading-5 text-slate-500">{task.description}</div> : null}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className={layoutClasses.agentPanelActions}>
        <div className="space-y-3">
          <form
            className={cn(
              "flex items-center gap-2 rounded-lg border border-border bg-slate-50 px-3 py-2 text-sm text-slate-500",
              canContinue && "bg-white text-slate-700"
            )}
            onSubmit={(event) => {
              event.preventDefault();
              if (!canContinue || continuationSubmitting) return;
              const prompt = continuationPrompt.trim();
              if (prompt.length < 4) return;
              setContinuationPrompt("");
              void onContinue(prompt);
            }}
          >
            <input
              className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-slate-400 disabled:cursor-not-allowed"
              placeholder="继续描述你想修改什么"
              value={continuationPrompt}
              disabled={!canContinue || continuationSubmitting}
              onChange={(event) => setContinuationPrompt(event.target.value)}
            />
            <button
              type="submit"
              disabled={!canContinue || continuationSubmitting || continuationPrompt.trim().length < 4}
              className="flex h-7 w-7 items-center justify-center rounded-md text-slate-500 transition hover:bg-slate-100 hover:text-ink disabled:cursor-not-allowed disabled:text-slate-300"
              aria-label="发起继续开发"
            >
              {continuationSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </button>
          </form>
          {controls.primaryAction === "approve" ? (
            <form action={approvePlanAction}>
              <input type="hidden" name="projectId" value={project.id} />
              <input type="hidden" name="runId" value={run.id} />
              <PendingButton type="submit" className="w-full" pendingLabel="批准中">
                批准计划
              </PendingButton>
            </form>
          ) : null}
          {controls.primaryAction === "start" ? (
            <Button type="button" disabled={loadingAction !== null || sandboxAutoStartPending} onClick={() => void onStart()} className="w-full">
              {loadingAction === "start" || sandboxAutoStartPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
              {sandboxAutoStartPending ? "正在启动 Vercel Sandbox" : "启动 Vercel Sandbox 构建"}
            </Button>
          ) : null}
          {controls.primaryAction === "stop" ? (
            <Button type="button" disabled={loadingAction !== null} onClick={() => void onStop()} className="w-full bg-slate-900 hover:bg-slate-700">
              {loadingAction === "stop" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Square className="h-4 w-4" />}
              停止 Sandbox
            </Button>
          ) : null}
          {controls.primaryAction === "complete" ? (
            <div className="flex h-10 items-center justify-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 text-sm font-semibold text-emerald-700">
              <CheckCircle2 className="h-4 w-4" />
              完成
            </div>
          ) : null}
          {controls.primaryAction === "error" ? (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">查看错误</div>
          ) : null}
          {actionError ? <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600">{actionError}</div> : null}
        </div>
      </div>
    </div>
  );
}

function StatusPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-slate-50 px-3 py-2">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</div>
      <div className="mt-1 truncate text-sm font-semibold text-slate-700">{value}</div>
    </div>
  );
}

function PreviewTab({
  run,
  sandboxRun,
  previewReloadNonce,
  onRefresh,
  refreshing
}: {
  run: AgentRunRow;
  sandboxRun: SandboxRunSnapshot | null;
  previewReloadNonce: number;
  onRefresh: () => Promise<void>;
  refreshing: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const previewUrl = run.sandbox_preview_url ?? sandboxRun?.preview_url ?? null;

  if (!previewUrl) {
    const copy = getRealtimeTabEmptyState("preview", run.sandbox_status ?? sandboxRun?.status ?? null);
    return (
      <EmptyState
        title={copy.title}
        body={copy.body}
      />
    );
  }

  return (
    <div className="mx-auto flex h-[calc(100vh-8rem)] max-w-6xl flex-col overflow-hidden rounded-lg border border-border bg-white">
      <div className="flex h-12 items-center justify-between border-b border-border px-4">
        <div className="text-sm font-semibold text-slate-700">Sandbox 状态：{run.sandbox_status ?? sandboxRun?.status ?? "unknown"}</div>
        <Button
          type="button"
          disabled={refreshing}
          onClick={() => {
            setFailed(false);
            void onRefresh();
          }}
          className="h-8 bg-white px-3 text-slate-700 hover:bg-slate-50"
        >
          {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          刷新
        </Button>
      </div>
      {failed ? (
        <div className="flex flex-1 items-center justify-center p-8 text-center text-sm text-red-600">预览服务暂不可用，请检查 Sandbox 状态</div>
      ) : (
        <iframe key={`${previewUrl}:${previewReloadNonce}`} title="Sandbox preview" src={previewUrl} onError={() => setFailed(true)} className="h-full w-full" />
      )}
    </div>
  );
}

function PlanTab({ artifacts }: { artifacts: ArtifactRow[] }) {
  if (!artifacts.length) {
    return <EmptyState title="正在生成概览" body="ProductAgent、ArchitectAgent 和 PlannerAgent 会逐步写入 Harness 文档，内容会自动出现在这里。" />;
  }

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      {artifacts.map((artifact) => (
        <Card key={artifact.id} className="p-6">
          <div className="mb-4 flex items-center justify-between border-b border-border pb-3">
            <div>
              <div className="text-sm font-bold">{artifact.path}</div>
              <div className="text-xs text-slate-400">{artifact.title}</div>
            </div>
          </div>
          <ReactMarkdown className="markdown">{stripOuterMarkdownFence(artifact.content)}</ReactMarkdown>
        </Card>
      ))}
    </div>
  );
}

function TerminalTab({ events }: { events: RunEventRow[] }) {
  return (
    <Card className="mx-auto max-w-6xl p-5">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <div className="text-sm font-bold">Run Events</div>
        </div>
      </div>
      <pre className="max-h-[calc(100vh-13rem)] overflow-auto whitespace-pre-wrap rounded-lg border border-border bg-slate-950 p-4 text-xs leading-5 text-slate-100">
        {events.map((event) => (
          <TerminalLine key={event.id} event={event} />
        ))}
      </pre>
    </Card>
  );
}

function TerminalLine({ event }: { event: RunEventRow }) {
  const streamClass = event.stream === "stderr" ? "text-red-300" : event.stream === "stdout" ? "text-slate-100" : "text-sky-200";
  const timestamp = new Date(event.created_at).toLocaleTimeString();
  return (
    <span className={cn("block", streamClass)}>
      [{timestamp}] [{event.agent_name ?? "System"}] [{event.step ?? event.event_type}] {event.message}
    </span>
  );
}

function FilesTab({ projectId, files, sandboxStatus, onNavigateStart }: { projectId: string; files: WorkspaceFileRow[]; sandboxStatus: string | null; onNavigateStart: () => void }) {
  if (!files.length) {
    const copy = getRealtimeTabEmptyState("files", sandboxStatus);
    return <EmptyState title={copy.title} body={copy.body} />;
  }

  return (
    <div className="mx-auto max-w-6xl">
      <FileTreeTable projectId={projectId} files={files} onNavigateStart={onNavigateStart} />
    </div>
  );
}

function EditorTab({
  projectId,
  filePath,
  files,
  sandboxStatus
}: {
  projectId: string;
  filePath: string;
  files: WorkspaceFileRow[];
  sandboxStatus: string | null;
}) {
  const [content, setContent] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const fileTree = useMemo(() => buildFileTree(files.map((file) => file.path)), [files]);
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(() => getExpandedDirectorySet(filePath));

  useEffect(() => {
    setExpandedDirs((current) => {
      const next = new Set(current);
      getExpandedDirectorySet(filePath).forEach((path) => next.add(path));
      return next;
    });
  }, [filePath]);

  useEffect(() => {
    if (!filePath) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/projects/${projectId}/files/content?path=${encodeURIComponent(filePath)}`, { cache: "no-store" })
      .then(async (response) => {
        const payload = (await response.json()) as { content?: string; code?: string; error?: string };
        if (!response.ok) {
          throw payload;
        }
        if (!cancelled) setContent(payload.content ?? "");
      })
      .catch((reason: { code?: string; error?: string }) => {
        if (!cancelled) setError(getFileContentErrorLabel(reason));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [filePath, projectId]);

  function toggleDirectory(path: string) {
    setExpandedDirs((current) => {
      const next = new Set(current);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }

  return (
    <Card className="mx-auto grid h-[calc(100vh-8rem)] max-w-7xl grid-cols-[280px_minmax(0,1fr)] overflow-hidden">
      <div className="min-h-0 border-r border-border bg-slate-50/70">
        <div className="flex h-12 items-center border-b border-border px-4 text-sm font-semibold text-slate-700">Files</div>
        <div className="h-[calc(100%-3rem)] overflow-auto p-2">
          {files.length ? (
            <FileTree
              nodes={fileTree.children}
              projectId={projectId}
              selectedPath={filePath}
              expandedDirs={expandedDirs}
              onToggleDirectory={toggleDirectory}
            />
          ) : (
            <div className="px-3 py-4 text-sm leading-6 text-slate-400">{getRealtimeTabEmptyState("editor", sandboxStatus).body}</div>
          )}
        </div>
      </div>

      <div className="min-w-0">
        <div className="flex h-12 items-center justify-between border-b border-border px-4">
          <div className="truncate text-sm font-semibold text-slate-700">{filePath || "未选择文件"}</div>
          <div className="text-xs text-slate-400">read-only</div>
        </div>
        {!filePath ? (
          <div className="flex h-[calc(100%-3rem)] items-center justify-center p-8 text-center text-sm text-slate-500">
            {files.length ? "在左侧文件树选择文件后，会在这里以只读模式打开。" : getRealtimeTabEmptyState("editor", sandboxStatus).body}
          </div>
        ) : error ? (
          <div className="flex h-[calc(100%-3rem)] items-center justify-center p-8 text-center text-sm text-red-600">
            <XCircle className="mr-2 h-4 w-4" />
            {error}
          </div>
        ) : loading ? (
          <div className="flex h-[calc(100%-3rem)] items-center justify-center text-sm text-slate-400">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Loading file...
          </div>
        ) : (
          <MonacoEditor
            height="calc(100% - 3rem)"
            language={getEditorLanguage(filePath)}
            value={content}
            theme="vs"
            options={{ readOnly: true, minimap: { enabled: false }, fontSize: 13, wordWrap: "on", scrollBeyondLastLine: false }}
          />
        )}
      </div>
    </Card>
  );
}

function FileTree({
  nodes,
  projectId,
  selectedPath,
  expandedDirs,
  onToggleDirectory,
  depth = 0
}: {
  nodes: FileTreeNode[];
  projectId: string;
  selectedPath: string;
  expandedDirs: Set<string>;
  onToggleDirectory: (path: string) => void;
  depth?: number;
}) {
  return (
    <div className="space-y-0.5">
      {nodes.map((node) => {
        const paddingLeft = `${0.75 + depth * 0.9}rem`;

        if (node.type === "directory") {
          const expanded = expandedDirs.has(node.path);
          return (
            <div key={node.path}>
              <button
                type="button"
                onClick={() => onToggleDirectory(node.path)}
                className="flex h-8 w-full items-center gap-2 rounded-md pr-2 text-left text-sm font-medium text-slate-700 transition hover:bg-white"
                style={{ paddingLeft }}
              >
                <ChevronRight className={cn("h-3.5 w-3.5 text-slate-400 transition", expanded && "rotate-90")} />
                {expanded ? <FolderOpen className="h-4 w-4 text-slate-500" /> : <Folder className="h-4 w-4 text-slate-500" />}
                <span className="truncate">{node.name}</span>
              </button>
              {expanded ? (
                <FileTree
                  nodes={node.children}
                  projectId={projectId}
                  selectedPath={selectedPath}
                  expandedDirs={expandedDirs}
                  onToggleDirectory={onToggleDirectory}
                  depth={depth + 1}
                />
              ) : null}
            </div>
          );
        }

        return (
          <WorkspaceLoadingLink
            key={node.path}
            href={`/projects/${projectId}?tab=editor&file=${encodeURIComponent(node.path)}`}
            onNavigateStart={() => undefined}
            className={cn(
              "flex h-8 items-center gap-2 rounded-md pr-2 text-sm text-slate-600 transition hover:bg-white hover:text-ink",
              selectedPath === node.path && "bg-primary/10 font-semibold text-primary hover:bg-primary/10 hover:text-primary"
            )}
            style={{ paddingLeft }}
          >
            <File className="h-4 w-4 shrink-0 text-slate-400" />
            <span className="truncate">{node.name}</span>
          </WorkspaceLoadingLink>
        );
      })}
    </div>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <Card className="mx-auto flex min-h-[420px] max-w-5xl flex-col items-center justify-center p-8 text-center">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">
        <FileText className="h-5 w-5" />
      </div>
      <div className="text-base font-bold">{title}</div>
      <p className="mt-2 max-w-md text-sm leading-6 text-slate-500">{body}</p>
    </Card>
  );
}
