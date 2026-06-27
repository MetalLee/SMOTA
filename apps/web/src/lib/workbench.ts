export type PrimaryRunAction = "approve" | "start" | "stop" | "complete" | "error" | "none";
export type DisplayProgressStatus = "todo" | "in_progress" | "done";
export type AgentDisplayName = "ProductAgent" | "ArchitectAgent" | "PlannerAgent" | "CodingAgent" | "BuildAgent" | "ReviewerAgent";

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
  workspaceOverlay: string;
  panel: string;
}

export interface FileTreeNode {
  name: string;
  path: string;
  type: "directory" | "file";
  children: FileTreeNode[];
}

export interface AgentDisplayStateInput {
  runStatus: string;
  currentStep: string | null;
  sandboxStatus: string | null;
  buildStatus: string | null;
  eventAgentNames: string[];
}

const ERROR_LABELS: Record<string, string> = {
  sandbox_not_ready: "Sandbox not ready",
  sandbox_stopped: "Sandbox stopped",
  file_too_large: "File too large",
  binary_file: "Binary file is not supported",
  invalid_file_path: "Invalid file path"
};

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
    agentPanelSummary: "min-h-0 flex-1 overflow-y-auto pr-1",
    agentPanelActions: "shrink-0 border-t border-border bg-white pt-4",
    main: "flex h-screen min-w-0 flex-1 flex-col overflow-hidden",
    content: "min-h-0 flex-1 overflow-y-auto p-6"
  };
}

export function getLoadingOverlayClasses(): LoadingOverlayClasses {
  return {
    globalOverlay: "fixed inset-0 z-50 flex items-center justify-center bg-white/55 backdrop-blur-md",
    workspaceOverlay: "absolute inset-0 z-30 flex items-center justify-center bg-white/55 backdrop-blur-md",
    panel: "flex items-center gap-3 rounded-lg border border-border bg-white/85 px-4 py-3 text-sm font-semibold text-slate-700 shadow-soft"
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

export function getExpandedDirectorySet(filePath: string): Set<string> {
  const segments = filePath.split("/").filter(Boolean);
  const expanded = new Set<string>();

  for (let index = 0; index < segments.length - 1; index++) {
    expanded.add(segments.slice(0, index + 1).join("/"));
  }

  return expanded;
}

export function getTaskDisplayStatus(taskStatus: string, runStatus: string, sandboxStatus: string | null): DisplayProgressStatus {
  if (taskStatus === "done" || runStatus === "succeeded") return "done";

  if (
    taskStatus === "in_progress" ||
    runStatus === "running" ||
    ["creating", "ready", "generating", "installing", "building", "fixing", "previewing"].includes(sandboxStatus ?? "")
  ) {
    return "in_progress";
  }

  return "todo";
}

export function getAgentDisplayStates(input: AgentDisplayStateInput): Record<AgentDisplayName, DisplayProgressStatus> {
  const completedAgents = new Set(input.eventAgentNames);
  const currentStep = input.currentStep?.toLowerCase() ?? "";
  const sandboxStatus = input.sandboxStatus ?? "";
  const buildStatus = input.buildStatus ?? "";
  const runSucceeded = input.runStatus === "succeeded";
  const sandboxStarted = ["creating", "ready", "generating", "installing", "building", "fixing", "previewing"].includes(sandboxStatus);
  const codingDone = runSucceeded || ["installing", "building", "fixing", "previewing"].includes(sandboxStatus) || buildStatus === "running" || buildStatus === "succeeded";
  const buildStarted = ["installing", "building", "fixing", "previewing"].includes(sandboxStatus) || buildStatus === "running" || buildStatus === "succeeded";

  return {
    ProductAgent: runSucceeded || completedAgents.has("ProductAgent") ? "done" : currentStep.includes("product") ? "in_progress" : "todo",
    ArchitectAgent: runSucceeded || completedAgents.has("ArchitectAgent") ? "done" : currentStep.includes("architect") ? "in_progress" : "todo",
    PlannerAgent: runSucceeded || completedAgents.has("PlannerAgent") ? "done" : currentStep.includes("planner") || currentStep.includes("plan") ? "in_progress" : "todo",
    CodingAgent: runSucceeded || codingDone ? "done" : sandboxStarted || currentStep.includes("coding") || currentStep.includes("opencode") ? "in_progress" : "todo",
    BuildAgent: runSucceeded || buildStatus === "succeeded" || sandboxStatus === "previewing" ? "done" : buildStarted ? "in_progress" : "todo",
    ReviewerAgent: runSucceeded ? "done" : currentStep.includes("review") ? "in_progress" : "todo"
  };
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
