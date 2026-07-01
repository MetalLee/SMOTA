export type PrimaryRunAction = "approve" | "start" | "stop" | "complete" | "error" | "none";
export type DisplayProgressStatus = "todo" | "in_progress" | "done" | "failed";
export type AgentDisplayName = "ProductAgent" | "ArchitectAgent" | "PlannerAgent" | "CodingAgent" | "BuildAgent" | "ReviewerAgent";
export type WorkbenchTabKey = "plan" | "preview" | "editor" | "terminal" | "files";

export interface FileContentErrorPayload {
  code?: string;
  error?: string;
}

export interface WorkbenchLayoutClasses {
  root: string;
  sidebar: string;
  agentPanel: string;
  agentPanelSummary: string;
  agentPanelActions: string;
  main: string;
  content: string;
}

export interface LoadingOverlayClasses {
  globalOverlay: string;
  mainAreaOverlay: string;
  workspaceOverlay: string;
  panel: string;
}

export interface WorkbenchHeaderAction {
  id: "share" | "publish";
  label: string;
}

export type RealtimeWorkbenchTab = "preview" | "editor" | "files";

export interface EmptyStateCopy {
  title: string;
  body: string;
}

export interface FileTreeNode {
  name: string;
  path: string;
  type: "directory" | "file";
  children: FileTreeNode[];
}

export interface WorkbenchTabDefinition {
  key: WorkbenchTabKey;
  label: string;
}

export interface FileTreeTableInput {
  id: string;
  path: string;
  file_type: string | null;
  change_type: string | null;
  size: number | null;
  last_modified_at: string | null;
}

export interface WorkspaceFileVisibilityInput {
  id: string;
  path: string;
  run_id: string | null;
  updated_at: string;
}

export interface FileTreeTableRow<T extends FileTreeTableInput> {
  id: string;
  path: string;
  name: string;
  kind: "directory" | "file";
  depth: number;
  file: T | null;
}

export interface AgentDisplayStateInput {
  runStatus: string;
  currentStep: string | null;
  sandboxStatus: string | null;
  buildStatus: string | null;
  eventAgentNames: string[];
  activeAgentNames?: string[];
}

export interface AgentProgressEventInput {
  agent_name: string | null;
  event_type: string;
}

export interface AgentDurationEventInput {
  agent_name: string | null;
  event_type: string;
  step?: string | null;
  created_at: string;
}

export interface AgentEventProgress {
  completedAgentNames: string[];
  activeAgentNames: string[];
}

export interface TaskDisplayInput {
  id: string;
  status: string;
  agent_name?: string | null;
  sort_order: number;
  created_at: string;
}

export interface TaskDisplayItem<T extends TaskDisplayInput> {
  task: T;
  displayStatus: DisplayProgressStatus;
}

export interface RunEventMergeInput {
  id: string;
  created_at: string;
}

export function stripOuterMarkdownFence(text: string): string {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:markdown|md)?[ \t]*\r?\n([\s\S]*?)\r?\n```[ \t]*$/i);
  return (fenced?.[1] ?? trimmed).trim();
}

const ERROR_LABELS: Record<string, string> = {
  sandbox_not_ready: "Sandbox not ready",
  sandbox_stopped: "Sandbox stopped",
  file_too_large: "File too large",
  binary_file: "Binary file is not supported",
  invalid_file_path: "Invalid file path"
};

const STATUS_LABELS: Record<string, string> = {
  draft: "草稿",
  planning: "规划中",
  planning_queued: "等待规划",
  planning_running: "规划中",
  pending: "等待中",
  pending_approval: "待批准",
  plan_ready: "计划已生成",
  approved: "已批准",
  approved_waiting_for_sandbox: "等待沙箱启动",
  running: "运行中",
  succeeded: "已完成",
  failed: "失败",
  failed_retryable: "可重试",
  not_ready: "未就绪",
  queued: "排队中",
  creating: "创建中",
  ready: "就绪",
  generating: "生成中",
  installing: "安装中",
  building: "构建中",
  fixing: "修复中",
  previewing: "预览中",
  stopped: "已停止"
};

export function getDashboardHref(): string {
  return "/dashboard";
}

export function shouldEnsurePreviewServer(params: {
  activeTab: string;
  previewUrl: string | null | undefined;
  inFlight?: boolean;
  lastAttemptAt?: number | null;
  now?: number;
  cooldownMs?: number;
}): boolean {
  if (params.activeTab !== "preview" || !params.previewUrl || params.inFlight) {
    return false;
  }

  const lastAttemptAt = params.lastAttemptAt ?? null;
  if (lastAttemptAt === null) {
    return true;
  }

  const now = params.now ?? Date.now();
  const cooldownMs = params.cooldownMs ?? 60_000;
  return now - lastAttemptAt >= cooldownMs;
}

export function shouldCheckSandboxWorkflowStatus(params: { runStatus: string; sandboxStatus?: string | null }): boolean {
  return params.runStatus === "running" && params.sandboxStatus !== "stopped";
}

export function getWorkspaceRefreshDelayMs(documentHidden: boolean): number {
  return documentHidden ? 15_000 : 3_000;
}

export function shouldStartWorkspaceRefresh(params: {
  inFlight: boolean;
  documentHidden: boolean;
  lastStartedAt?: number | null;
  now?: number;
}): boolean {
  if (params.inFlight) {
    return false;
  }

  if (!params.documentHidden) {
    return true;
  }

  const lastStartedAt = params.lastStartedAt ?? null;
  if (lastStartedAt === null) {
    return true;
  }

  return (params.now ?? Date.now()) - lastStartedAt >= getWorkspaceRefreshDelayMs(true);
}

export function shouldReloadPreviewAfterRecovery(params: { previewRecovered?: boolean; previewHealthy: boolean }): boolean {
  return Boolean(params.previewRecovered) && !params.previewHealthy;
}

export function getWorkbenchTabs(): WorkbenchTabDefinition[] {
  return [
    { key: "plan", label: "概览" },
    { key: "preview", label: "应用预览器" },
    { key: "editor", label: "编辑器" },
    { key: "terminal", label: "终端" },
    { key: "files", label: "文件" }
  ];
}

export function getLatestRunEventCursor(events: RunEventMergeInput[]): string | null {
  return events.reduce<string | null>((latest, event) => {
    if (!latest || event.created_at > latest) {
      return event.created_at;
    }

    return latest;
  }, null);
}

export function mergeRunEvents<T extends RunEventMergeInput>(currentEvents: T[], incomingEvents: T[]): T[] {
  const eventsById = new Map<string, T>();

  for (const event of currentEvents) {
    eventsById.set(event.id, event);
  }

  for (const event of incomingEvents) {
    eventsById.set(event.id, event);
  }

  return [...eventsById.values()].sort((a, b) => {
    const createdAtDelta = a.created_at.localeCompare(b.created_at);
    if (createdAtDelta !== 0) return createdAtDelta;

    return a.id.localeCompare(b.id);
  });
}

export function shouldReloadRunEvents(currentRunId: string, nextRunId: string): boolean {
  return currentRunId !== nextRunId;
}

export function getLocalizedStatusLabel(status: string | null | undefined): string {
  if (!status) return STATUS_LABELS.not_ready;
  return STATUS_LABELS[status] ?? status;
}

export function getRunControls(runStatus: string, sandboxStatus: string | null): { primaryAction: PrimaryRunAction; label: string } {
  if (runStatus === "draft" || runStatus === "pending_approval") {
    return { primaryAction: "approve", label: "批准计划" };
  }

  if (runStatus === "approved" || runStatus === "failed_retryable") {
    return { primaryAction: "start", label: "启动 Vercel Sandbox 构建" };
  }

  if (runStatus === "succeeded") {
    return { primaryAction: "complete", label: "完成" };
  }

  if (runStatus === "failed") {
    return { primaryAction: "error", label: "查看错误" };
  }

  if (runStatus === "running" || ["creating", "ready", "generating", "installing", "building", "fixing", "previewing"].includes(sandboxStatus ?? "")) {
    return { primaryAction: "stop", label: "停止 Sandbox" };
  }

  return { primaryAction: "none", label: "刷新状态" };
}

export function getWorkbenchLayoutClasses(): WorkbenchLayoutClasses {
  return {
    root: "flex h-screen overflow-hidden bg-[#f6f7fb]",
    sidebar: "flex h-screen w-[360px] shrink-0 flex-col overflow-hidden border-r border-border bg-white p-5",
    agentPanel: "flex min-h-0 flex-1 flex-col",
    agentPanelSummary: "agent-sidebar-scroll min-h-0 flex-1 overflow-y-auto pr-1",
    agentPanelActions: "shrink-0 border-t border-border bg-white pt-4",
    main: "flex h-screen min-w-0 flex-1 flex-col overflow-hidden",
    content: "min-h-0 flex-1 overflow-y-auto p-6"
  };
}

export function getLoadingOverlayClasses(): LoadingOverlayClasses {
  return {
    globalOverlay: "fixed inset-0 z-50 flex items-center justify-center bg-white/55 backdrop-blur-md",
    mainAreaOverlay: "fixed inset-y-0 left-64 right-0 z-50 flex items-center justify-center bg-white/55 backdrop-blur-md",
    workspaceOverlay: "absolute inset-0 z-30 flex items-center justify-center bg-white/55 backdrop-blur-md",
    panel: "flex items-center gap-3 rounded-lg border border-border bg-white/85 px-4 py-3 text-sm font-semibold text-slate-700 shadow-soft"
  };
}

export function shouldShowWorkspaceNavigationOverlay(currentTab: string, nextTab: string, currentFilePath: string, nextFilePath: string): boolean {
  if (currentTab === "editor" && nextTab === "editor" && currentFilePath !== nextFilePath) {
    return false;
  }

  return currentTab !== nextTab || currentFilePath !== nextFilePath;
}

export function getWorkbenchHeaderActions(): WorkbenchHeaderAction[] {
  return [
    { id: "share", label: "分享" },
    { id: "publish", label: "发布" }
  ];
}

export function getRealtimeTabEmptyState(tab: RealtimeWorkbenchTab, sandboxStatus: string | null): EmptyStateCopy {
  const status = sandboxStatus ?? "not_ready";

  if (tab === "preview") {
    return {
      title: "正在准备应用浏览器",
      body: `Vite 默认首页会在初始化和依赖安装后自动出现，随后会随着 Sandbox 内文件变化继续刷新。当前 Sandbox 状态：${status}`
    };
  }

  if (tab === "editor") {
    return {
      title: "正在同步 Sandbox 文件",
      body: `创建过程中写入 /workspace 的文件会持续出现在这里，选择文件后将通过服务端 API 只读打开。当前 Sandbox 状态：${status}`
    };
  }

  return {
    title: "正在索引 Sandbox 文件",
    body: `Harness、Vite 初始文件和 CodingAgent 生成的文件会在创建过程中逐步显示。当前 Sandbox 状态：${status}`
  };
}

function sortFileTreeNodes(nodes: FileTreeNode[]) {
  nodes.sort((a, b) => {
    if (a.type !== b.type) return a.type === "directory" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  nodes.forEach((node) => sortFileTreeNodes(node.children));
}

export function buildFileTree(paths: string[]): FileTreeNode {
  const root: FileTreeNode = { name: "", path: "", type: "directory", children: [] };

  for (const filePath of paths) {
    const segments = filePath.split("/").filter(Boolean);
    let current = root;

    segments.forEach((segment, index) => {
      const path = segments.slice(0, index + 1).join("/");
      const type: FileTreeNode["type"] = index === segments.length - 1 ? "file" : "directory";
      let child = current.children.find((node) => node.name === segment && node.type === type);

      if (!child) {
        child = { name: segment, path, type, children: [] };
        current.children.push(child);
      }

      current = child;
    });
  }

  sortFileTreeNodes(root.children);
  return root;
}

function flattenFileTreeTableRows<T extends FileTreeTableInput>(
  nodes: FileTreeNode[],
  fileByPath: Map<string, T>,
  depth: number,
  rows: Array<FileTreeTableRow<T>>
) {
  for (const node of nodes) {
    const file = node.type === "file" ? fileByPath.get(node.path) ?? null : null;
    rows.push({
      id: node.type === "directory" ? `dir:${node.path}` : file?.id ?? `file:${node.path}`,
      path: node.path,
      name: node.name,
      kind: node.type === "directory" ? "directory" : "file",
      depth,
      file
    });

    if (node.type === "directory") {
      flattenFileTreeTableRows(node.children, fileByPath, depth + 1, rows);
    }
  }
}

export function getFileTreeTableRows<T extends FileTreeTableInput>(files: T[]): Array<FileTreeTableRow<T>> {
  const fileByPath = new Map(files.map((file) => [file.path, file]));
  const tree = buildFileTree(files.map((file) => file.path));
  const rows: Array<FileTreeTableRow<T>> = [];
  flattenFileTreeTableRows(tree.children, fileByPath, 0, rows);
  return rows;
}

export function selectVisibleWorkspaceFiles<T extends WorkspaceFileVisibilityInput>(files: T[], currentRunId: string): T[] {
  const currentRunFiles = files.filter((file) => file.run_id === currentRunId);
  const sourceFiles = currentRunFiles.length ? currentRunFiles : files;
  const fileByPath = new Map<string, T>();

  for (const file of sourceFiles) {
    const current = fileByPath.get(file.path);
    if (!current || file.updated_at.localeCompare(current.updated_at) >= 0) {
      fileByPath.set(file.path, file);
    }
  }

  return [...fileByPath.values()].sort((a, b) => a.path.localeCompare(b.path));
}

export function getExpandedDirectorySet(filePath: string): Set<string> {
  const segments = filePath.split("/").filter(Boolean);
  const expanded = new Set<string>();

  for (let index = 0; index < segments.length - 1; index++) {
    expanded.add(segments.slice(0, index + 1).join("/"));
  }

  return expanded;
}

export function getTaskDisplayStatus(taskStatus: string, runStatus: string, sandboxStatus: string | null): DisplayProgressStatus {
  void runStatus;
  void sandboxStatus;

  if (taskStatus === "done") return "done";
  if (taskStatus === "in_progress") return "in_progress";
  if (taskStatus === "failed") {
    return "failed";
  }

  return "todo";
}

const AGENT_DISPLAY_NAMES: AgentDisplayName[] = ["ProductAgent", "ArchitectAgent", "PlannerAgent", "CodingAgent", "BuildAgent", "ReviewerAgent"];
const PLANNING_AGENT_ORDER: AgentDisplayName[] = ["ProductAgent", "ArchitectAgent", "PlannerAgent"];

function isAgentDisplayName(value: string | null | undefined): value is AgentDisplayName {
  return Boolean(value && AGENT_DISPLAY_NAMES.includes(value as AgentDisplayName));
}

function getNonCodingTaskAgentStatus<T extends TaskDisplayInput>(
  task: T,
  agentStates?: Partial<Record<AgentDisplayName, DisplayProgressStatus>>
): DisplayProgressStatus | null {
  if (!agentStates || !isAgentDisplayName(task.agent_name) || task.agent_name === "CodingAgent") {
    return null;
  }

  return agentStates[task.agent_name] ?? null;
}

const TASK_AGENT_ORDER = new Map<AgentDisplayName, number>(AGENT_DISPLAY_NAMES.map((agentName, index) => [agentName, index]));

function getTaskAgentOrder(task: TaskDisplayInput): number {
  if (!isAgentDisplayName(task.agent_name)) {
    return AGENT_DISPLAY_NAMES.length;
  }

  return TASK_AGENT_ORDER.get(task.agent_name) ?? AGENT_DISPLAY_NAMES.length;
}

export function getTaskDisplayItems<T extends TaskDisplayInput>(
  tasks: T[],
  runStatus: string,
  sandboxStatus: string | null,
  currentStep?: string | null,
  agentStates?: Partial<Record<AgentDisplayName, DisplayProgressStatus>>
): Array<TaskDisplayItem<T>> {
  void currentStep;
  void agentStates;

  return tasks
    .map((task) => {
      const nonCodingAgentStatus = getNonCodingTaskAgentStatus(task, agentStates);
      return {
        task,
        displayStatus: nonCodingAgentStatus ?? getTaskDisplayStatus(task.status, runStatus, sandboxStatus)
      };
    })
    .sort((a, b) => {
      const agentDelta = getTaskAgentOrder(a.task) - getTaskAgentOrder(b.task);
      if (agentDelta !== 0) return agentDelta;

      const sortDelta = a.task.sort_order - b.task.sort_order;
      if (sortDelta !== 0) return sortDelta;

      return a.task.created_at.localeCompare(b.task.created_at);
    });
}

export function getAgentDisplayStates(input: AgentDisplayStateInput): Record<AgentDisplayName, DisplayProgressStatus> {
  const completedAgents = new Set(input.eventAgentNames);
  const activeAgents = new Set(input.activeAgentNames ?? []);
  const currentStep = input.currentStep?.toLowerCase() ?? "";
  const buildStatus = input.buildStatus ?? "";
  const runSucceeded = input.runStatus === "succeeded";
  const runWorkflowActive = input.runStatus === "running";
  const runFailed = input.runStatus === "failed";
  const codingFailed =
    runFailed &&
    (currentStep.includes("opencode") || currentStep === "failed" || currentStep.includes("generating") || currentStep.includes("coding"));
  const buildFailed = runFailed && (buildStatus === "failed" || currentStep.includes("build_failed") || currentStep.includes("fixing"));
  const codingActive = runWorkflowActive && (currentStep.includes("running_opencode") || currentStep.includes("coding"));
  const codingDone =
    runSucceeded ||
    (runWorkflowActive &&
      (currentStep.includes("installing_after_opencode") ||
        currentStep.includes("building") ||
        currentStep.includes("fixing") ||
        currentStep.includes("indexing_files") ||
        buildStatus === "running" ||
        buildStatus === "succeeded"));
  const buildActive =
    runWorkflowActive &&
    (currentStep.includes("installing_after_opencode") || currentStep.includes("building") || currentStep.includes("fixing") || buildStatus === "running");
  const buildDone = runSucceeded || (runWorkflowActive && buildStatus === "succeeded");
  const reviewActive = runWorkflowActive && (currentStep === "review_report" || currentStep === "review_screenshot" || currentStep.startsWith("review_"));

  return {
    ProductAgent: runSucceeded || completedAgents.has("ProductAgent") ? "done" : activeAgents.has("ProductAgent") || currentStep.includes("product") ? "in_progress" : "todo",
    ArchitectAgent: runSucceeded || completedAgents.has("ArchitectAgent") ? "done" : activeAgents.has("ArchitectAgent") || currentStep.includes("architect") ? "in_progress" : "todo",
    PlannerAgent: runSucceeded || completedAgents.has("PlannerAgent") ? "done" : activeAgents.has("PlannerAgent") || currentStep.includes("planner") ? "in_progress" : "todo",
    CodingAgent: codingFailed ? "failed" : codingDone ? "done" : codingActive ? "in_progress" : "todo",
    BuildAgent: buildFailed ? "failed" : buildDone ? "done" : buildActive ? "in_progress" : "todo",
    ReviewerAgent: runSucceeded ? "done" : reviewActive ? "in_progress" : "todo"
  };
}

export function getAgentEventProgress(events: AgentProgressEventInput[]): AgentEventProgress {
  const completed = new Set<string>();
  const active = new Set<string>();

  for (const event of events) {
    if (!event.agent_name) {
      continue;
    }

    if (event.event_type === "agent.completed") {
      const planningAgentIndex = PLANNING_AGENT_ORDER.indexOf(event.agent_name as AgentDisplayName);
      if (planningAgentIndex > 0 && !completed.has(PLANNING_AGENT_ORDER[planningAgentIndex - 1])) {
        continue;
      }

      completed.add(event.agent_name);
      active.delete(event.agent_name);
      continue;
    }

    if ((event.event_type === "agent.started" || event.event_type === "agent.reasoning") && !completed.has(event.agent_name)) {
      active.add(event.agent_name);
    }
  }

  return {
    completedAgentNames: [...completed],
    activeAgentNames: [...active]
  };
}

function formatDuration(milliseconds: number): string {
  const safeMilliseconds = Math.max(0, milliseconds);

  if (safeMilliseconds > 0 && safeMilliseconds < 1000) {
    return "<1秒";
  }

  if (safeMilliseconds < 10_000) {
    const seconds = safeMilliseconds / 1000;
    return `${Number.isInteger(seconds) ? seconds.toFixed(0) : seconds.toFixed(1)}秒`;
  }

  const totalSeconds = Math.round(safeMilliseconds / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (minutes > 0) {
    return `${minutes}分${String(seconds).padStart(2, "0")}秒`;
  }

  return `${seconds}秒`;
}

function setEarliestTimestamp(timestamps: Map<string, number>, key: string, timestamp: number) {
  const current = timestamps.get(key);
  if (current === undefined || timestamp < current) {
    timestamps.set(key, timestamp);
  }
}

function setLatestTimestamp(timestamps: Map<string, number>, key: string, timestamp: number) {
  const current = timestamps.get(key);
  if (current === undefined || timestamp > current) {
    timestamps.set(key, timestamp);
  }
}

export function getAgentDurationLabels(
  events: AgentDurationEventInput[],
  nowIso = new Date().toISOString()
): Partial<Record<AgentDisplayName, string>> {
  const now = new Date(nowIso).getTime();
  const startedAt = new Map<string, number>();
  const completedAt = new Map<string, number>();

  for (const event of events) {
    const timestamp = new Date(event.created_at).getTime();
    if (!Number.isFinite(timestamp)) continue;
    const step = event.step ?? "";

    if (event.agent_name && event.event_type === "agent.started") {
      setEarliestTimestamp(startedAt, event.agent_name, timestamp);
    }

    if (event.agent_name && event.event_type === "agent.completed") {
      setLatestTimestamp(completedAt, event.agent_name, timestamp);
    }

    if (step === "opencode_run" && event.event_type === "sandbox.command.started") {
      setEarliestTimestamp(startedAt, "CodingAgent", timestamp);
    }

    if (step === "opencode_run" && event.event_type === "sandbox.command.finished") {
      setLatestTimestamp(completedAt, "CodingAgent", timestamp);
    }

    if ((step === "install" || step === "build" || step === "build_retry" || step === "opencode_fix") && event.event_type === "sandbox.command.started") {
      setEarliestTimestamp(startedAt, "BuildAgent", timestamp);
    }

    if (
      (step === "install" || step === "build" || step === "build_retry" || step === "opencode_fix") &&
      event.event_type === "sandbox.command.finished"
    ) {
      setLatestTimestamp(completedAt, "BuildAgent", timestamp);
    }

    if (event.event_type === "build.started") {
      setEarliestTimestamp(startedAt, "BuildAgent", timestamp);
    }

    if (event.event_type === "build.succeeded" || event.event_type === "build.failed") {
      setLatestTimestamp(completedAt, "BuildAgent", timestamp);
    }

    if (event.event_type === "review.screenshot.started") {
      setEarliestTimestamp(startedAt, "ReviewerAgent", timestamp);
    }

    if (event.event_type === "artifact.created" && step === "review_report") {
      setLatestTimestamp(completedAt, "ReviewerAgent", timestamp);
    }
  }

  if (!startedAt.has("ReviewerAgent")) {
    const buildCompletedAt = completedAt.get("BuildAgent");
    const reviewerCompletedAt = completedAt.get("ReviewerAgent");
    if (buildCompletedAt !== undefined && reviewerCompletedAt !== undefined) {
      startedAt.set("ReviewerAgent", buildCompletedAt);
    }
  }

  const labels: Partial<Record<AgentDisplayName, string>> = {};
  startedAt.forEach((start, agentName) => {
    const end = completedAt.get(agentName) ?? now;
    labels[agentName as AgentDisplayName] = formatDuration(end - start);
  });

  return labels;
}

export function getFileContentErrorLabel(payload: FileContentErrorPayload): string {
  if (payload.code && ERROR_LABELS[payload.code]) {
    return ERROR_LABELS[payload.code];
  }

  const message = payload.error?.toLowerCase() ?? "";
  if (message.includes("stopped") || message.includes("expired")) {
    return ERROR_LABELS.sandbox_stopped;
  }
  if (message.includes("large") || message.includes("limit")) {
    return ERROR_LABELS.file_too_large;
  }
  if (message.includes("binary")) {
    return ERROR_LABELS.binary_file;
  }
  if (message.includes("invalid") || message.includes("traversal")) {
    return ERROR_LABELS.invalid_file_path;
  }

  return ERROR_LABELS.sandbox_not_ready;
}

export function getEditorLanguage(path: string): string {
  if (path.endsWith(".ts") || path.endsWith(".tsx")) return "typescript";
  if (path.endsWith(".js") || path.endsWith(".jsx") || path.endsWith(".mjs") || path.endsWith(".cjs")) return "javascript";
  if (path.endsWith(".css")) return "css";
  if (path.endsWith(".json")) return "json";
  if (path.endsWith(".md") || path.endsWith(".mdx")) return "markdown";
  if (path.endsWith(".html")) return "html";
  if (path.endsWith(".yml") || path.endsWith(".yaml")) return "yaml";
  if (path.endsWith(".sh") || path.endsWith(".bash")) return "shell";
  return "plaintext";
}

export function formatBytes(size: number | null): string {
  if (size === null || Number.isNaN(size)) return "-";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}
