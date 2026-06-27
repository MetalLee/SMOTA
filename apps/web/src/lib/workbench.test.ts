import { describe, expect, it } from "vitest";
import {
  getAgentDisplayStates,
  buildFileTree,
  getDashboardHref,
  getEditorLanguage,
  getExpandedDirectorySet,
  getRealtimeTabEmptyState,
  getWorkbenchHeaderActions,
  getFileContentErrorLabel,
  getLoadingOverlayClasses,
  getAgentEventProgress,
  getAgentReasoningEvents,
  getRunControls,
  getTaskDisplayStatus,
  getWorkbenchLayoutClasses,
  shouldShowWorkspaceNavigationOverlay
} from "./workbench";

describe("workbench helpers", () => {
  it("maps run status to the available primary action", () => {
    expect(getRunControls("draft", null).primaryAction).toBe("approve");
    expect(getRunControls("pending_approval", null).primaryAction).toBe("approve");
    expect(getRunControls("approved", "ready").primaryAction).toBe("start");
    expect(getRunControls("running", "building").primaryAction).toBe("stop");
    expect(getRunControls("succeeded", "previewing").primaryAction).toBe("complete");
    expect(getRunControls("failed", "failed").primaryAction).toBe("error");
  });

  it("normalizes file-content API failures into MVP editor messages", () => {
    expect(getFileContentErrorLabel({ code: "sandbox_not_ready" })).toBe("Sandbox not ready");
    expect(getFileContentErrorLabel({ code: "sandbox_stopped" })).toBe("Sandbox stopped");
    expect(getFileContentErrorLabel({ code: "file_too_large" })).toBe("File too large");
    expect(getFileContentErrorLabel({ code: "binary_file" })).toBe("Binary file is not supported");
    expect(getFileContentErrorLabel({ code: "invalid_file_path" })).toBe("Invalid file path");
    expect(getFileContentErrorLabel({ error: "anything else" })).toBe("Sandbox not ready");
  });

  it("selects a readable Monaco language from the file path", () => {
    expect(getEditorLanguage("src/App.tsx")).toBe("typescript");
    expect(getEditorLanguage("src/index.css")).toBe("css");
    expect(getEditorLanguage("package.json")).toBe("json");
    expect(getEditorLanguage("README.md")).toBe("markdown");
    expect(getEditorLanguage("scripts/build.sh")).toBe("shell");
    expect(getEditorLanguage("unknown.env")).toBe("plaintext");
  });

  it("keeps project detail sidebar and workspace scrolling independent", () => {
    const classes = getWorkbenchLayoutClasses();

    expect(classes.root).toContain("h-screen");
    expect(classes.root).toContain("overflow-hidden");
    expect(classes.sidebar).toContain("h-screen");
    expect(classes.sidebar).toContain("overflow-hidden");
    expect(classes.main).toContain("h-screen");
    expect(classes.content).toContain("overflow-y-auto");
  });

  it("pins project detail actions below a scrollable agent panel summary", () => {
    const classes = getWorkbenchLayoutClasses();

    expect(classes.agentPanel).toContain("min-h-0");
    expect(classes.agentPanelSummary).toContain("overflow-y-auto");
    expect(classes.agentPanelSummary).toContain("flex-1");
    expect(classes.agentPanelActions).toContain("shrink-0");
    expect(classes.agentPanelActions).toContain("border-t");
  });

  it("derives running and completed task checklist display status from run progress", () => {
    expect(getTaskDisplayStatus("todo", "running", "building")).toBe("in_progress");
    expect(getTaskDisplayStatus("in_progress", "running", "building")).toBe("in_progress");
    expect(getTaskDisplayStatus("todo", "succeeded", "previewing")).toBe("done");
    expect(getTaskDisplayStatus("done", "running", "building")).toBe("done");
  });

  it("derives agent display states from persisted events and sandbox progress", () => {
    const states = getAgentDisplayStates({
      runStatus: "running",
      currentStep: "building",
      sandboxStatus: "building",
      buildStatus: "running",
      eventAgentNames: ["ProductAgent", "ArchitectAgent", "PlannerAgent"]
    });

    expect(states.ProductAgent).toBe("done");
    expect(states.ArchitectAgent).toBe("done");
    expect(states.PlannerAgent).toBe("done");
    expect(states.CodingAgent).toBe("done");
    expect(states.BuildAgent).toBe("in_progress");
    expect(states.ReviewerAgent).toBe("todo");

    expect(
      getAgentDisplayStates({
        runStatus: "succeeded",
        currentStep: "succeeded",
        sandboxStatus: "previewing",
        buildStatus: "succeeded",
        eventAgentNames: ["ProductAgent", "ArchitectAgent", "PlannerAgent"]
      }).ReviewerAgent
    ).toBe("done");
  });

  it("uses glass loading overlays for global and workspace-scoped navigation", () => {
    const classes = getLoadingOverlayClasses();

    expect(classes.globalOverlay).toContain("fixed");
    expect(classes.globalOverlay).toContain("backdrop-blur");
    expect(classes.workspaceOverlay).toContain("absolute");
    expect(classes.workspaceOverlay).toContain("inset-0");
    expect(classes.workspaceOverlay).toContain("backdrop-blur");
    expect(classes.panel).toContain("shadow");
  });

  it("does not show a workspace overlay when switching files inside the editor", () => {
    expect(shouldShowWorkspaceNavigationOverlay("editor", "editor", "src/App.tsx", "src/main.tsx")).toBe(false);
    expect(shouldShowWorkspaceNavigationOverlay("editor", "editor", "", "src/main.tsx")).toBe(false);
    expect(shouldShowWorkspaceNavigationOverlay("editor", "preview", "src/App.tsx", "src/App.tsx")).toBe(true);
    expect(shouldShowWorkspaceNavigationOverlay("preview", "editor", "", "src/App.tsx")).toBe(true);
  });

  it("keeps only active project detail header actions", () => {
    expect(getWorkbenchHeaderActions().map((action) => action.label)).toEqual(["分享", "发布"]);
  });

  it("uses dashboard as the workbench brand destination", () => {
    expect(getDashboardHref()).toBe("/dashboard");
  });

  it("derives waiting, running, and completed planning agent states from event types", () => {
    const productRunning = getAgentEventProgress([
      { agent_name: "ProductAgent", event_type: "agent.started" },
      { agent_name: "ProductAgent", event_type: "agent.reasoning" }
    ]);

    expect(
      getAgentDisplayStates({
        runStatus: "planning",
        currentStep: "planning_running",
        sandboxStatus: null,
        buildStatus: null,
        eventAgentNames: productRunning.completedAgentNames,
        activeAgentNames: productRunning.activeAgentNames
      })
    ).toMatchObject({
      ProductAgent: "in_progress",
      ArchitectAgent: "todo",
      PlannerAgent: "todo"
    });

    const architectRunning = getAgentEventProgress([
      { agent_name: "ProductAgent", event_type: "agent.started" },
      { agent_name: "ProductAgent", event_type: "agent.completed" },
      { agent_name: "ArchitectAgent", event_type: "agent.started" }
    ]);

    expect(
      getAgentDisplayStates({
        runStatus: "planning",
        currentStep: "planning_running",
        sandboxStatus: null,
        buildStatus: null,
        eventAgentNames: architectRunning.completedAgentNames,
        activeAgentNames: architectRunning.activeAgentNames
      })
    ).toMatchObject({
      ProductAgent: "done",
      ArchitectAgent: "in_progress",
      PlannerAgent: "todo"
    });
  });

  it("keeps recent agent reasoning events for the left panel", () => {
    expect(
      getAgentReasoningEvents(
        [
          { agent_name: "ProductAgent", event_type: "agent.reasoning", message: "明确目标用户", created_at: "2026-06-28T00:00:00.000Z" },
          { agent_name: "PlannerAgent", event_type: "agent.completed", message: "完成计划", created_at: "2026-06-28T00:00:01.000Z" },
          { agent_name: "ArchitectAgent", event_type: "agent.reasoning", message: "确定安全边界", created_at: "2026-06-28T00:00:02.000Z" }
        ],
        1
      )
    ).toEqual([{ agentName: "ArchitectAgent", message: "确定安全边界" }]);
  });

  it("describes realtime Sandbox visibility in Preview, Editor, and Files empty states", () => {
    expect(getRealtimeTabEmptyState("preview", "installing")).toEqual({
      title: "正在准备应用浏览器",
      body: "Vite 默认首页会在初始化和依赖安装后自动出现，随后会随着 Sandbox 内文件变化继续刷新。当前 Sandbox 状态：installing"
    });
    expect(getRealtimeTabEmptyState("editor", "generating")).toEqual({
      title: "正在同步 Sandbox 文件",
      body: "创建过程中写入 /workspace 的文件会持续出现在这里，选择文件后将通过服务端 API 只读打开。当前 Sandbox 状态：generating"
    });
    expect(getRealtimeTabEmptyState("files", null)).toEqual({
      title: "正在索引 Sandbox 文件",
      body: "Harness、Vite 初始文件和 CodingAgent 生成的文件会在创建过程中逐步显示。当前 Sandbox 状态：not_ready"
    });
  });

  it("builds a sorted nested file tree from workspace paths", () => {
    const tree = buildFileTree(["src/components/Button.tsx", "src/App.tsx", "README.md"]);

    expect(tree.children.map((node) => `${node.type}:${node.name}`)).toEqual(["directory:src", "file:README.md"]);
    expect(tree.children[0]?.children.map((node) => `${node.type}:${node.name}`)).toEqual(["directory:components", "file:App.tsx"]);
    expect(tree.children[0]?.children[0]?.children.map((node) => `${node.type}:${node.name}`)).toEqual(["file:Button.tsx"]);
  });

  it("expands every parent directory for the selected file", () => {
    expect([...getExpandedDirectorySet("src/components/Button.tsx")]).toEqual(["src", "src/components"]);
    expect([...getExpandedDirectorySet("README.md")]).toEqual([]);
  });
});
