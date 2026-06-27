"use client";

import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import ReactMarkdown from "react-markdown";
import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import {
  Bot,
  CheckCircle2,
  Circle,
  Clock,
  FileText,
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
import { approvePlanAction } from "@/app/actions/projects";
import { PendingButton } from "@/components/pending-button";
import { LoadingOverlay, WorkspaceLoadingLink } from "@/components/route-loading";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  formatBytes,
  getAgentDisplayStates,
  getEditorLanguage,
  getFileContentErrorLabel,
  getLoadingOverlayClasses,
  getRunControls,
  getTaskDisplayStatus,
  getWorkbenchLayoutClasses,
  type AgentDisplayName
} from "@/lib/workbench";
import type { AgentRunRow, ArtifactRow, ProjectRow, RunEventRow, TaskRow, WorkspaceFileRow } from "@smota/shared";

const MonacoEditor = dynamic(() => import("@monaco-editor/react"), {
  ssr: false,
  loading: () => <div className="flex h-full items-center justify-center text-sm text-slate-400">Loading editor...</div>
});

const agents: AgentDisplayName[] = ["ProductAgent", "ArchitectAgent", "PlannerAgent", "CodingAgent", "BuildAgent", "ReviewerAgent"];
const tabs = [
  ["preview", "应用预览器", Monitor],
  ["editor", "编辑器", PanelRight],
  ["plan", "计划", FileText],
  ["terminal", "终端", Terminal],
  ["files", "文件", FileText]
] as const;

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
  const [files, setFiles] = useState(initialFiles);
  const [sandboxRun, setSandboxRun] = useState<SandboxRunSnapshot | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [loadingAction, setLoadingAction] = useState<"start" | "stop" | null>(null);
  const [previewRefreshing, setPreviewRefreshing] = useState(false);
  const [workspaceNavigating, setWorkspaceNavigating] = useState(false);
  const [, startRefreshTransition] = useTransition();

  const queryTab = searchParams.get("tab") ?? initialActiveTab;
  const activeTab = tabs.some(([key]) => key === queryTab) ? queryTab : "plan";
  const selectedFilePath = searchParams.get("file") ?? initialFilePath ?? files[0]?.path ?? "";
  const controls = getRunControls(run.status, run.sandbox_status);
  const layoutClasses = getWorkbenchLayoutClasses();
  const overlayClasses = getLoadingOverlayClasses();

  const refreshWorkspace = useCallback(async () => {
    const [workspaceResponse, eventsResponse] = await Promise.all([
      fetch(`/api/projects/${project.id}/workspace`, { cache: "no-store" }),
      fetch(`/api/runs/${run.id}/events`, { cache: "no-store" })
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
    }

    if (eventsResponse.ok) {
      const payload = (await eventsResponse.json()) as { events: RunEventRow[] };
      setEvents(payload.events);
    }
  }, [project.id, run.id]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      void refreshWorkspace();
    }, 3000);
    return () => window.clearInterval(interval);
  }, [refreshWorkspace]);

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
    startRefreshTransition(() => {
      router.refresh();
    });
    await refreshWorkspace();
    setPreviewRefreshing(false);
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
          actionError={actionError}
          onStart={startSandbox}
          onStop={stopSandbox}
          layoutClasses={layoutClasses}
        />
      </aside>

      <main className={layoutClasses.main}>
        <header className="flex h-16 items-center justify-between border-b border-border bg-white px-5">
          <nav className="flex items-center gap-1">
            {tabs.map(([key, label, Icon]) => (
              <WorkspaceLoadingLink
                key={key}
                href={`/projects/${project.id}?tab=${key}${selectedFilePath && key === "editor" ? `&file=${encodeURIComponent(selectedFilePath)}` : ""}`}
                onNavigateStart={() => setWorkspaceNavigating(true)}
                className={cn(
                  "flex h-9 items-center gap-2 rounded-lg px-3 text-sm font-medium text-slate-500",
                  activeTab === key && "bg-slate-100 text-ink"
                )}
              >
                <Icon className="h-4 w-4" />
                {label}
              </WorkspaceLoadingLink>
            ))}
            <span className="ml-2 rounded-lg border border-border px-3 py-2 text-sm text-slate-400">跟随智能体</span>
          </nav>
          <div className="flex items-center gap-2 text-slate-300">
            <button disabled className="flex h-9 items-center gap-2 rounded-lg border border-border px-3 text-sm">
              <Share2 className="h-4 w-4" />
              分享
            </button>
            <button disabled className="flex h-9 items-center gap-2 rounded-lg border border-border px-3 text-sm">
              <UploadCloud className="h-4 w-4" />
              发布
            </button>
            <button disabled className="h-9 rounded-lg border border-border px-3 text-sm">控制台</button>
          </div>
        </header>

        <section className={cn(layoutClasses.content, "relative")}>
          {activeTab === "plan" ? <PlanTab artifacts={artifacts} /> : null}
          {activeTab === "terminal" ? <TerminalTab events={events} run={run} sandboxRun={sandboxRun} /> : null}
          {activeTab === "files" ? <FilesTab projectId={project.id} files={files} onNavigateStart={() => setWorkspaceNavigating(true)} /> : null}
          {activeTab === "editor" ? <EditorTab projectId={project.id} filePath={selectedFilePath} /> : null}
          {activeTab === "preview" ? <PreviewTab run={run} sandboxRun={sandboxRun} onRefresh={refreshAll} refreshing={previewRefreshing} /> : null}
          {workspaceNavigating ? <LoadingOverlay className={overlayClasses.workspaceOverlay} label="正在加载工作区" /> : null}
        </section>
      </main>
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
  actionError,
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
  actionError: string | null;
  onStart: () => Promise<void>;
  onStop: () => Promise<void>;
  layoutClasses: ReturnType<typeof getWorkbenchLayoutClasses>;
}) {
  const eventAgents = useMemo(() => new Set(events.map((event) => event.agent_name).filter((agentName): agentName is string => Boolean(agentName))), [events]);
  const agentStates = useMemo(
    () =>
      getAgentDisplayStates({
        runStatus: run.status,
        currentStep: run.current_step,
        sandboxStatus: run.sandbox_status,
        buildStatus: run.build_status,
        eventAgentNames: [...eventAgents]
      }),
    [eventAgents, run.build_status, run.current_step, run.sandbox_status, run.status]
  );

  return (
    <div className={layoutClasses.agentPanel}>
      <div className={layoutClasses.agentPanelSummary}>
        <div className="mb-6">
          <div className="mb-3 flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-sm font-bold text-white">S</div>
            <div className="text-sm font-bold">SMOTA</div>
          </div>
          <h1 className="text-xl font-bold">{project.name}</h1>
          <p className="mt-2 text-sm leading-6 text-slate-500">{project.prompt}</p>
        </div>

        <div className="mb-4 grid grid-cols-2 gap-2">
          <StatusPill label="Run" value={run.status} />
          <StatusPill label="Sandbox" value={run.sandbox_status ?? "not_ready"} />
        </div>

        <div className="mb-6">
          <div className="mb-3 text-sm font-semibold text-slate-700">Agent step timeline</div>
          <div className="space-y-2">
            {agents.map((agent) => {
              const displayStatus = agentStates[agent];
              return (
                <div key={agent} className="flex items-center gap-3 rounded-lg border border-border bg-slate-50 px-3 py-2">
                  <div className="flex h-7 w-7 items-center justify-center rounded-full bg-white text-primary">
                    <Bot className="h-4 w-4" />
                  </div>
                  <span className="flex-1 text-sm font-medium text-slate-700">{agent}</span>
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

        <div className="mb-6 rounded-lg border border-border p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">当前阶段</div>
          <div className="mt-2 text-sm font-semibold text-slate-700">{run.current_step ?? run.status}</div>
          {run.build_error ? <div className="mt-2 line-clamp-3 text-xs leading-5 text-red-600">{run.build_error}</div> : null}
        </div>

        <div className="pb-6">
          <div className="mb-3 text-sm font-semibold text-slate-700">task checklist</div>
          <div className="space-y-2">
            {tasks.map((task) => {
              const displayStatus = getTaskDisplayStatus(task.status, run.status, run.sandbox_status);
              return (
                <div key={task.id} className="flex gap-2 text-sm text-slate-600">
                  {displayStatus === "done" ? (
                    <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-500" />
                  ) : displayStatus === "in_progress" ? (
                    <Loader2 className="mt-0.5 h-4 w-4 animate-spin text-primary" />
                  ) : (
                    <Circle className="mt-0.5 h-4 w-4 text-slate-300" />
                  )}
                  <div>
                    <div className="font-medium text-slate-700">{task.title}</div>
                    <div className="text-xs leading-5 text-slate-500">{task.description}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className={layoutClasses.agentPanelActions}>
        <div className="space-y-3">
          <div className="flex items-center gap-2 rounded-lg border border-border bg-slate-50 px-3 py-2 text-sm text-slate-400">
            <input className="min-w-0 flex-1 bg-transparent outline-none" placeholder="继续描述你想修改什么" disabled />
            <Send className="h-4 w-4" />
          </div>
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
            <Button type="button" disabled={loadingAction !== null} onClick={() => void onStart()} className="w-full">
              {loadingAction === "start" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
              启动 Vercel Sandbox 构建
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

function PreviewTab({ run, sandboxRun, onRefresh, refreshing }: { run: AgentRunRow; sandboxRun: SandboxRunSnapshot | null; onRefresh: () => Promise<void>; refreshing: boolean }) {
  const [failed, setFailed] = useState(false);
  const previewUrl = run.sandbox_preview_url ?? sandboxRun?.preview_url ?? null;

  if (!previewUrl) {
    return (
      <EmptyState
        title="等待 Vercel Sandbox 启动应用预览"
        body={`当前 Sandbox 状态：${run.sandbox_status ?? sandboxRun?.status ?? "not_ready"}`}
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
        <iframe title="Sandbox preview" src={previewUrl} onError={() => setFailed(true)} className="h-full w-full" />
      )}
    </div>
  );
}

function PlanTab({ artifacts }: { artifacts: ArtifactRow[] }) {
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
          <ReactMarkdown className="markdown">{artifact.content}</ReactMarkdown>
        </Card>
      ))}
    </div>
  );
}

function TerminalTab({ events, run, sandboxRun }: { events: RunEventRow[]; run: AgentRunRow; sandboxRun: SandboxRunSnapshot | null }) {
  return (
    <Card className="mx-auto max-w-6xl p-5">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <div className="text-sm font-bold">Run Events</div>
          <div className="mt-1 text-xs text-slate-400">
            Agent: {run.status} · Sandbox: {run.sandbox_status ?? sandboxRun?.status ?? "not_ready"} · Build: {run.build_status ?? "pending"}
          </div>
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

function FilesTab({ projectId, files, onNavigateStart }: { projectId: string; files: WorkspaceFileRow[]; onNavigateStart: () => void }) {
  if (!files.length) {
    return <EmptyState title="等待 Vercel Sandbox 生成文件" body="Sandbox 构建阶段完成后，这里会展示扫描到的文件索引。" />;
  }

  return (
    <Card className="mx-auto max-w-6xl overflow-hidden">
      <div className="grid grid-cols-[minmax(220px,1fr)_120px_140px_110px_190px] border-b border-border bg-slate-50 px-5 py-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
        <div>path</div>
        <div>file_type</div>
        <div>change_type</div>
        <div>size</div>
        <div>last_modified_at</div>
      </div>
      <div className="divide-y divide-border">
        {files.map((file) => (
          <WorkspaceLoadingLink
            key={file.id}
            href={`/projects/${projectId}?tab=editor&file=${encodeURIComponent(file.path)}`}
            onNavigateStart={onNavigateStart}
            className="grid grid-cols-[minmax(220px,1fr)_120px_140px_110px_190px] px-5 py-3 text-sm hover:bg-slate-50"
          >
            <span className="truncate font-medium text-slate-800">{file.path}</span>
            <span className="text-slate-500">{file.file_type ?? "file"}</span>
            <span className="text-slate-500">{file.change_type ?? "generated"}</span>
            <span className="text-slate-500">{formatBytes(file.size)}</span>
            <span className="text-slate-500">{file.last_modified_at ? new Date(file.last_modified_at).toLocaleString() : "-"}</span>
          </WorkspaceLoadingLink>
        ))}
      </div>
    </Card>
  );
}

function EditorTab({ projectId, filePath }: { projectId: string; filePath: string }) {
  const [content, setContent] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

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

  if (!filePath) {
    return <EmptyState title="暂无可打开文件" body="在 Files Tab 点击文件后，会在这里以只读模式打开。" />;
  }

  return (
    <Card className="mx-auto flex h-[calc(100vh-8rem)] max-w-6xl flex-col overflow-hidden">
      <div className="flex h-12 items-center justify-between border-b border-border px-4">
        <div className="truncate text-sm font-semibold text-slate-700">{filePath}</div>
        <div className="text-xs text-slate-400">read-only</div>
      </div>
      {error ? (
        <div className="flex flex-1 items-center justify-center p-8 text-center text-sm text-red-600">
          <XCircle className="mr-2 h-4 w-4" />
          {error}
        </div>
      ) : loading ? (
        <div className="flex flex-1 items-center justify-center text-sm text-slate-400">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Loading file...
        </div>
      ) : (
        <MonacoEditor
          height="100%"
          language={getEditorLanguage(filePath)}
          value={content}
          theme="vs"
          options={{ readOnly: true, minimap: { enabled: false }, fontSize: 13, wordWrap: "on", scrollBeyondLastLine: false }}
        />
      )}
    </Card>
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
