export type PrimaryRunAction = "approve" | "start" | "stop" | "complete" | "error" | "none";

export interface FileContentErrorPayload {
  code?: string;
  error?: string;
}

export interface WorkbenchLayoutClasses {
  root: string;
  sidebar: string;
  main: string;
  content: string;
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
    sidebar: "flex h-screen w-[360px] shrink-0 flex-col overflow-y-auto border-r border-border bg-white p-5",
    main: "flex h-screen min-w-0 flex-1 flex-col overflow-hidden",
    content: "min-h-0 flex-1 overflow-y-auto p-6"
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
