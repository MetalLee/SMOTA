import ReactMarkdown from "react-markdown";
import { Bot, CheckCircle2, Circle, Clock, FileText, Monitor, PanelRight, Send, Share2, Terminal, UploadCloud } from "lucide-react";
import { approvePlanAction } from "@/app/actions/projects";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { AgentRunRow, ArtifactRow, ProjectRow, RunEventRow, TaskRow, WorkspaceFileRow } from "@smota/shared";
import { cn } from "@/lib/utils";

const agents = ["ProductAgent", "ArchitectAgent", "PlannerAgent", "CodingAgent", "BuildAgent", "ReviewerAgent"];
const tabs = [
  ["preview", "应用预览器", Monitor],
  ["editor", "编辑器", PanelRight],
  ["plan", "计划", FileText],
  ["terminal", "终端", Terminal],
  ["files", "文件", FileText]
] as const;

interface WorkbenchProps {
  project: ProjectRow;
  run: AgentRunRow;
  artifacts: ArtifactRow[];
  tasks: TaskRow[];
  events: RunEventRow[];
  files: WorkspaceFileRow[];
  activeTab: string;
}

export function Workbench({ project, run, artifacts, tasks, events, files, activeTab }: WorkbenchProps) {
  const selectedTab = tabs.some(([key]) => key === activeTab) ? activeTab : "plan";

  return (
    <div className="flex min-h-screen bg-[#f6f7fb]">
      <aside className="flex w-[360px] shrink-0 flex-col border-r border-border bg-white p-5">
        <div className="mb-6">
          <div className="mb-3 flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-sm font-bold text-white">
              S
            </div>
            <div className="text-sm font-bold">SMOTA</div>
          </div>
          <h1 className="text-xl font-bold">{project.name}</h1>
          <p className="mt-2 text-sm leading-6 text-slate-500">{project.prompt}</p>
        </div>

        <div className="mb-6">
          <div className="mb-3 text-sm font-semibold text-slate-700">Agent 执行流</div>
          <div className="space-y-2">
            {agents.map((agent) => {
              const completed = events.some((event) => event.agent_name === agent);
              return (
                <div key={agent} className="flex items-center gap-3 rounded-lg border border-border bg-slate-50 px-3 py-2">
                  <div className="flex h-7 w-7 items-center justify-center rounded-full bg-white text-primary">
                    <Bot className="h-4 w-4" />
                  </div>
                  <span className="flex-1 text-sm font-medium text-slate-700">{agent}</span>
                  {completed ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> : <Clock className="h-4 w-4 text-slate-300" />}
                </div>
              );
            })}
          </div>
        </div>

        <div className="mb-6 rounded-lg border border-border p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">当前阶段</div>
          <div className="mt-2 text-sm font-semibold text-slate-700">{run.current_step ?? run.status}</div>
        </div>

        <div className="mb-6">
          <div className="mb-3 text-sm font-semibold text-slate-700">任务 checklist</div>
          <div className="space-y-2">
            {tasks.map((task) => (
              <div key={task.id} className="flex gap-2 text-sm text-slate-600">
                {task.status === "done" ? <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-500" /> : <Circle className="mt-0.5 h-4 w-4 text-slate-300" />}
                <div>
                  <div className="font-medium text-slate-700">{task.title}</div>
                  <div className="text-xs leading-5 text-slate-500">{task.description}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-auto space-y-3">
          <div className="flex items-center gap-2 rounded-lg border border-border bg-slate-50 px-3 py-2 text-sm text-slate-400">
            <input className="min-w-0 flex-1 bg-transparent outline-none" placeholder="继续描述你想修改什么" disabled />
            <Send className="h-4 w-4" />
          </div>
          <form action={approvePlanAction}>
            <input type="hidden" name="projectId" value={project.id} />
            <input type="hidden" name="runId" value={run.id} />
            <Button type="submit" disabled={run.status === "approved"} className="w-full">
              批准计划并启动 Vercel Sandbox 构建
            </Button>
          </form>
        </div>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 items-center justify-between border-b border-border bg-white px-5">
          <nav className="flex items-center gap-1">
            {tabs.map(([key, label, Icon]) => (
              <a
                key={key}
                href={`/projects/${project.id}?tab=${key}`}
                className={cn(
                  "flex h-9 items-center gap-2 rounded-lg px-3 text-sm font-medium text-slate-500",
                  selectedTab === key && "bg-slate-100 text-ink"
                )}
              >
                <Icon className="h-4 w-4" />
                {label}
              </a>
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

        <section className="min-h-0 flex-1 overflow-auto p-6">
          {selectedTab === "plan" ? <PlanTab artifacts={artifacts} /> : null}
          {selectedTab === "terminal" ? <TerminalTab events={events} /> : null}
          {selectedTab === "files" ? <FilesTab files={files} /> : null}
          {selectedTab === "editor" ? <EmptyState title="暂无可编辑文件" body="Monaco Editor 已预留，Phase 5 会通过服务端 API 读取 Sandbox 文件。" /> : null}
          {selectedTab === "preview" ? <EmptyState title="等待 Vercel Sandbox 生成应用" body="本阶段只生成计划和 Artifact，不会启动 Sandbox 或 preview iframe。" /> : null}
        </section>
      </main>
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

function TerminalTab({ events }: { events: RunEventRow[] }) {
  return (
    <Card className="mx-auto max-w-5xl p-5">
      <div className="mb-4 text-sm font-bold">Run Events</div>
      <div className="space-y-3">
        {events.map((event) => (
          <div key={event.id} className="rounded-lg border border-border bg-slate-50 px-4 py-3">
            <div className="text-xs font-semibold text-slate-400">
              {event.agent_name ?? "System"} · {event.event_type}
            </div>
            <div className="mt-1 text-sm text-slate-700">{event.message}</div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function FilesTab({ files }: { files: WorkspaceFileRow[] }) {
  if (!files.length) {
    return <EmptyState title="暂无 workspace 文件" body="Sandbox 构建阶段完成后，这里会展示扫描到的文件索引。" />;
  }

  return (
    <Card className="mx-auto max-w-5xl divide-y divide-border">
      {files.map((file) => (
        <div key={file.id} className="flex items-center justify-between px-5 py-3 text-sm">
          <span>{file.path}</span>
          <span className="text-slate-400">{file.file_type ?? "file"}</span>
        </div>
      ))}
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
