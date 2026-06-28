import { describe, expect, it } from "vitest";
import {
  getAgentDisplayStates,
  getAgentDurationLabels,
  buildFileTree,
  getDashboardHref,
  getEditorLanguage,
  getExpandedDirectorySet,
  getFileTreeTableRows,
  getLatestRunEventCursor,
  getLocalizedStatusLabel,
  getRealtimeTabEmptyState,
  getWorkbenchTabs,
  getWorkbenchHeaderActions,
  getFileContentErrorLabel,
  getLoadingOverlayClasses,
  getAgentEventProgress,
  getTaskDisplayItems,
  shouldEnsurePreviewServer,
  shouldReloadPreviewAfterRecovery,
  selectVisibleWorkspaceFiles,
  shouldReloadRunEvents,
  stripOuterMarkdownFence,
  mergeRunEvents,
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

  it("pins project detail actions below a hover-scrollable agent panel summary", () => {
    const classes = getWorkbenchLayoutClasses();

    expect(classes.agentPanel).toContain("min-h-0");
    expect(classes.agentPanelSummary).toContain("overflow-y-auto");
    expect(classes.agentPanelSummary).toContain("agent-sidebar-scroll");
    expect(classes.agentPanelSummary).toContain("flex-1");
    expect(classes.agentPanelActions).toContain("shrink-0");
    expect(classes.agentPanelActions).toContain("border-t");
  });

  it("keeps future plan tasks waiting until their own task status becomes active", () => {
    expect(getTaskDisplayStatus("todo", "running", "building")).toBe("todo");
    expect(getTaskDisplayStatus("in_progress", "running", "building")).toBe("in_progress");
    expect(getTaskDisplayStatus("todo", "succeeded", "previewing")).toBe("todo");
    expect(getTaskDisplayStatus("done", "running", "building")).toBe("done");
  });

  it("keeps task status independent when the run fails", () => {
    expect(getTaskDisplayStatus("todo", "failed", "failed")).toBe("todo");
    expect(getTaskDisplayStatus("in_progress", "failed", "failed")).toBe("in_progress");
    expect(getTaskDisplayStatus("done", "failed", "failed")).toBe("done");
  });

  it("shows only persisted task progress while CodingAgent is running", () => {
    expect(
      getTaskDisplayItems(
        [
          { id: "done", title: "确认目标", description: null, status: "done", sort_order: 0, created_at: "2026-06-28T00:00:00.000Z" },
          { id: "active", title: "实现页面", description: null, status: "todo", sort_order: 1, created_at: "2026-06-28T00:00:01.000Z" },
          { id: "waiting", title: "补充动效", description: null, status: "todo", sort_order: 2, created_at: "2026-06-28T00:00:02.000Z" }
        ],
        "running",
        "generating",
        "running_opencode"
      ).map((item) => `${item.displayStatus}:${item.task.id}`)
    ).toEqual(["done:done", "todo:active", "todo:waiting"]);

    expect(
      getTaskDisplayItems(
        [
          { id: "first", title: "实现页面", description: null, status: "todo", sort_order: 1, created_at: "2026-06-28T00:00:01.000Z" },
          { id: "second", title: "补充动效", description: null, status: "todo", sort_order: 2, created_at: "2026-06-28T00:00:02.000Z" }
        ],
        "pending_approval",
        "ready",
        "plan_ready"
      ).map((item) => `${item.displayStatus}:${item.task.id}`)
    ).toEqual(["todo:first", "todo:second"]);
  });

  it("binds non-CodingAgent task display to agent state while CodingAgent tasks use persisted status", () => {
    const agentStates = {
      ProductAgent: "done",
      ArchitectAgent: "done",
      PlannerAgent: "done",
      CodingAgent: "in_progress",
      BuildAgent: "todo",
      ReviewerAgent: "todo"
    } as const;

    expect(
      getTaskDisplayItems(
        [
          { id: "planned", title: "鐢熸垚璁″垝", description: null, status: "todo", agent_name: "PlannerAgent", sort_order: 1, created_at: "2026-06-28T00:00:01.000Z" },
          { id: "coded", title: "瀹炵幇椤甸潰", description: null, status: "todo", agent_name: "CodingAgent", sort_order: 2, created_at: "2026-06-28T00:00:02.000Z" },
          { id: "built", title: "杩愯鏋勫缓", description: null, status: "todo", agent_name: "BuildAgent", sort_order: 3, created_at: "2026-06-28T00:00:03.000Z" },
          { id: "reviewed", title: "鐢熸垚鎶ュ憡", description: null, status: "todo", agent_name: "ReviewerAgent", sort_order: 4, created_at: "2026-06-28T00:00:04.000Z" }
        ],
        "pending_approval",
        "generating",
        "plan_ready",
        agentStates
      ).map((item) => `${item.displayStatus}:${item.task.id}`)
    ).toEqual(["done:planned", "todo:coded", "todo:built", "todo:reviewed"]);
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
    expect(classes.mainAreaOverlay).toContain("fixed");
    expect(classes.mainAreaOverlay).toContain("left-64");
    expect(classes.mainAreaOverlay).toContain("right-0");
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

  it("keeps CodingAgent waiting before the user approves the plan", () => {
    expect(
      getAgentDisplayStates({
        runStatus: "pending_approval",
        currentStep: "plan_ready",
        sandboxStatus: "ready",
        buildStatus: null,
        eventAgentNames: ["ProductAgent", "ArchitectAgent", "PlannerAgent"]
      }).CodingAgent
    ).toBe("todo");
  });

  it("keeps sandbox agents waiting after approval until the sandbox workflow is running", () => {
    expect(
      getAgentDisplayStates({
        runStatus: "approved",
        currentStep: "approved_waiting_for_sandbox",
        sandboxStatus: "previewing",
        buildStatus: "succeeded",
        eventAgentNames: ["ProductAgent", "ArchitectAgent", "PlannerAgent"]
      })
    ).toMatchObject({
      CodingAgent: "todo",
      BuildAgent: "todo",
      ReviewerAgent: "todo"
    });
  });

  it("does not complete CodingAgent or BuildAgent during the early preview bootstrap", () => {
    expect(
      getAgentDisplayStates({
        runStatus: "running",
        currentStep: "preview_ready",
        sandboxStatus: "previewing",
        buildStatus: null,
        eventAgentNames: ["ProductAgent", "ArchitectAgent", "PlannerAgent"]
      })
    ).toMatchObject({
      CodingAgent: "todo",
      BuildAgent: "todo"
    });
  });

  it("marks non-CodingAgent bound tasks failed when the sandbox agent failed", () => {
    const agentStates = getAgentDisplayStates({
      runStatus: "failed",
      currentStep: "build_failed",
      sandboxStatus: "failed",
      buildStatus: "failed",
      eventAgentNames: ["ProductAgent", "ArchitectAgent", "PlannerAgent"]
    });

    expect(agentStates.BuildAgent).toBe("failed");
    expect(
      getTaskDisplayItems(
        [{ id: "build", title: "杩愯鏋勫缓", description: null, status: "todo", agent_name: "BuildAgent", sort_order: 1, created_at: "2026-06-28T00:00:01.000Z" }],
        "failed",
        "failed",
        "build_failed",
        agentStates
      )[0]?.displayStatus
    ).toBe("failed");

    expect(
      getTaskDisplayItems(
        [{ id: "code", title: "实现页面", description: null, status: "todo", agent_name: "CodingAgent", sort_order: 1, created_at: "2026-06-28T00:00:01.000Z" }],
        "failed",
        "failed",
        "build_failed",
        agentStates
      )[0]?.displayStatus
    ).toBe("todo");
  });

  it("throttles automatic Sandbox preview recovery checks while the preview tab has a URL", () => {
    expect(shouldEnsurePreviewServer({ activeTab: "preview", previewUrl: "https://preview.example.dev", now: 1000 })).toBe(true);
    expect(shouldEnsurePreviewServer({ activeTab: "preview", previewUrl: null, now: 1000 })).toBe(false);
    expect(shouldEnsurePreviewServer({ activeTab: "files", previewUrl: "https://preview.example.dev", now: 1000 })).toBe(false);
    expect(
      shouldEnsurePreviewServer({
        activeTab: "preview",
        previewUrl: "https://preview.example.dev",
        inFlight: true,
        now: 1000
      })
    ).toBe(false);
    expect(
      shouldEnsurePreviewServer({
        activeTab: "preview",
        previewUrl: "https://preview.example.dev",
        lastAttemptAt: 1000,
        now: 30_000,
        cooldownMs: 60_000
      })
    ).toBe(false);
    expect(
      shouldEnsurePreviewServer({
        activeTab: "preview",
        previewUrl: "https://preview.example.dev",
        lastAttemptAt: 1000,
        now: 61_000,
        cooldownMs: 60_000
      })
    ).toBe(true);
  });

  it("reloads recovered previews only when the current iframe has not loaded", () => {
    expect(shouldReloadPreviewAfterRecovery({ previewRecovered: false, previewHealthy: false })).toBe(false);
    expect(shouldReloadPreviewAfterRecovery({ previewRecovered: true, previewHealthy: true })).toBe(false);
    expect(shouldReloadPreviewAfterRecovery({ previewRecovered: true, previewHealthy: false })).toBe(true);
  });

  it("removes only the outer markdown fence from artifact content", () => {
    expect(stripOuterMarkdownFence("```markdown\n# ARCHITECTURE.md\n\nBody\n```")).toBe("# ARCHITECTURE.md\n\nBody");
    expect(stripOuterMarkdownFence("```md\r\n# RULES\r\n\r\nBody\r\n```")).toBe("# RULES\n\nBody".replaceAll("\n", "\r\n").trim());
    expect(stripOuterMarkdownFence("# Title\n\n```ts\nconst ok = true;\n```")).toBe("# Title\n\n```ts\nconst ok = true;\n```");
  });

  it("puts the overview tab before the preview tab", () => {
    expect(getWorkbenchTabs().map((tab) => `${tab.key}:${tab.label}`)).toEqual([
      "plan:概览",
      "preview:应用预览器",
      "editor:编辑器",
      "terminal:终端",
      "files:文件"
    ]);
  });

  it("builds tree table rows for workspace files", () => {
    const rows = getFileTreeTableRows([
      {
        id: "file-app",
        path: "src/App.tsx",
        file_type: "tsx",
        change_type: "generated",
        size: 120,
        last_modified_at: "2026-06-28T00:00:00.000Z"
      },
      {
        id: "file-package",
        path: "package.json",
        file_type: "json",
        change_type: "generated",
        size: 80,
        last_modified_at: "2026-06-28T00:00:00.000Z"
      }
    ]);

    expect(rows.map((row) => `${row.kind}:${row.depth}:${row.name}:${row.path}`)).toEqual([
      "directory:0:src:src",
      "file:1:App.tsx:src/App.tsx",
      "file:0:package.json:package.json"
    ]);
    expect(rows.find((row) => row.path === "src/App.tsx")?.file?.id).toBe("file-app");
    expect(rows.find((row) => row.path === "src")?.file).toBeNull();
  });

  it("deduplicates workspace files and prefers the current run once it has indexed files", () => {
    const files = [
      { id: "old-app", run_id: "run-old", path: "src/App.tsx", updated_at: "2026-06-27T10:00:00.000Z" },
      { id: "new-app", run_id: "run-new", path: "src/App.tsx", updated_at: "2026-06-28T10:00:00.000Z" },
      { id: "old-package", run_id: "run-old", path: "package.json", updated_at: "2026-06-27T10:00:00.000Z" }
    ];

    expect(selectVisibleWorkspaceFiles(files, "run-new").map((file) => file.id)).toEqual(["new-app"]);
    expect(selectVisibleWorkspaceFiles(files, "run-empty").map((file) => file.id)).toEqual(["old-package", "new-app"]);
  });

  it("merges polled run events without dropping earlier timeline context", () => {
    const initialEvents = [
      { id: "event-2", created_at: "2026-06-28T00:00:02.000Z", event_type: "sandbox.command.started" },
      { id: "event-1", created_at: "2026-06-28T00:00:01.000Z", event_type: "agent.started" }
    ];
    const polledEvents = [
      { id: "event-2", created_at: "2026-06-28T00:00:02.000Z", event_type: "sandbox.command.started" },
      { id: "event-3", created_at: "2026-06-28T00:00:03.000Z", event_type: "sandbox.command.finished" }
    ];

    const mergedEvents = mergeRunEvents(initialEvents, polledEvents);

    expect(mergedEvents.map((event) => event.id)).toEqual(["event-1", "event-2", "event-3"]);
    expect(getLatestRunEventCursor(mergedEvents)).toBe("2026-06-28T00:00:03.000Z");
  });

  it("reloads run-scoped events when the workspace switches to a new run", () => {
    expect(shouldReloadRunEvents("run-old", "run-new")).toBe(true);
    expect(shouldReloadRunEvents("run-current", "run-current")).toBe(false);
  });

  it("localizes run and sandbox status labels for the sidebar", () => {
    expect(getLocalizedStatusLabel("pending_approval")).toBe("待批准");
    expect(getLocalizedStatusLabel("not_ready")).toBe("未就绪");
    expect(getLocalizedStatusLabel("approved_waiting_for_sandbox")).toBe("等待沙箱启动");
    expect(getLocalizedStatusLabel("custom_state")).toBe("custom_state");
    expect(getLocalizedStatusLabel(null)).toBe("未就绪");
  });

  it("formats agent duration labels from persisted timeline events", () => {
    expect(
      getAgentDurationLabels(
        [
          { agent_name: "ProductAgent", event_type: "agent.started", created_at: "2026-06-28T00:00:00.000Z" },
          { agent_name: "ProductAgent", event_type: "agent.completed", created_at: "2026-06-28T00:00:01.500Z" },
          { agent_name: "ArchitectAgent", event_type: "agent.started", created_at: "2026-06-28T00:00:02.000Z" }
        ],
        "2026-06-28T00:01:07.000Z"
      )
    ).toMatchObject({
      ProductAgent: "1.5秒",
      ArchitectAgent: "1分05秒"
    });
  });

  it("clamps negative agent durations caused by out-of-order event timestamps", () => {
    expect(
      getAgentDurationLabels([
        { agent_name: "PlannerAgent", event_type: "agent.started", created_at: "2026-06-28T00:00:02.000Z" },
        { agent_name: "PlannerAgent", event_type: "agent.completed", created_at: "2026-06-28T00:00:01.500Z" }
      ])
    ).toMatchObject({
      PlannerAgent: "0秒"
    });
  });

  it("derives sandbox phase agent durations from persisted workflow events", () => {
    expect(
      getAgentDurationLabels([
        { agent_name: null, event_type: "sandbox.command.started", step: "opencode_run", created_at: "2026-06-28T00:00:00.000Z" },
        { agent_name: null, event_type: "sandbox.command.finished", step: "opencode_run", created_at: "2026-06-28T00:00:10.000Z" },
        { agent_name: null, event_type: "sandbox.command.started", step: "install", created_at: "2026-06-28T00:00:12.000Z" },
        { agent_name: null, event_type: "build.started", step: "build", created_at: "2026-06-28T00:00:20.000Z" },
        { agent_name: null, event_type: "build.succeeded", step: "build", created_at: "2026-06-28T00:00:42.000Z" },
        { agent_name: null, event_type: "review.screenshot.started", step: "review_screenshot", created_at: "2026-06-28T00:00:45.000Z" },
        { agent_name: null, event_type: "artifact.created", step: "review_report", created_at: "2026-06-28T00:01:05.000Z" }
      ])
    ).toMatchObject({
      CodingAgent: "10秒",
      BuildAgent: "30秒",
      ReviewerAgent: "20秒"
    });
  });

  it("sorts task display items by agent flow while preserving original order within each agent", () => {
    expect(
      getTaskDisplayItems(
        [
          { id: "review", title: "输出报告", description: null, status: "todo", agent_name: "ReviewerAgent", sort_order: 1, created_at: "2026-06-28T00:00:03.000Z" },
          { id: "code-second", title: "补充交互", description: null, status: "done", agent_name: "CodingAgent", sort_order: 4, created_at: "2026-06-28T00:00:04.000Z" },
          { id: "product", title: "确认目标", description: null, status: "failed", agent_name: "ProductAgent", sort_order: 9, created_at: "2026-06-28T00:00:09.000Z" },
          { id: "build", title: "运行构建", description: null, status: "in_progress", agent_name: "BuildAgent", sort_order: 5, created_at: "2026-06-28T00:00:05.000Z" },
          { id: "planner", title: "生成计划", description: null, status: "todo", agent_name: "PlannerAgent", sort_order: 2, created_at: "2026-06-28T00:00:02.000Z" },
          { id: "code-first", title: "实现页面", description: null, status: "todo", agent_name: "CodingAgent", sort_order: 3, created_at: "2026-06-28T00:00:03.000Z" },
          { id: "architect", title: "生成架构", description: null, status: "done", agent_name: "ArchitectAgent", sort_order: 1, created_at: "2026-06-28T00:00:01.000Z" }
        ],
        "planning",
        null
      ).map((item) => `${item.displayStatus}:${item.task.id}`)
    ).toEqual(["failed:product", "done:architect", "todo:planner", "todo:code-first", "done:code-second", "in_progress:build", "todo:review"]);
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
