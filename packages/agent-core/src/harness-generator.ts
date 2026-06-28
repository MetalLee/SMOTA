import { deriveProjectName, type GeneratedRunEvent, type GeneratedTask, type HarnessBundle, type ProjectCreationInput } from "@smota/shared";
import { createAgents, createArchitecture, createCodexRules, createProjectBrief, createRoadmap } from "./mock-agents";

export function generateHarnessBundle(input: ProjectCreationInput): HarnessBundle {
  const projectName = deriveProjectName(input.prompt);
  const artifacts = [
    createProjectBrief(input),
    createArchitecture(input),
    createRoadmap(input),
    createCodexRules(input),
    createAgents(input)
  ];

  const tasks: GeneratedTask[] = [
    {
      title: "确认产品目标",
      description: `围绕“${input.prompt}”明确目标用户、MVP 范围和不做事项。`,
      status: "done",
      sortOrder: 1
    },
    {
      title: "确认技术架构",
      description: "约束为 Vercel Sandbox Runner，避免 Local Runner 和 Fastify API。",
      status: "done",
      sortOrder: 2
    },
    {
      title: "生成 Roadmap",
      description: "拆分计划、验收标准和后续构建阶段。",
      status: "done",
      sortOrder: 3
    },
    {
      title: "等待用户批准计划",
      description: "批准后才允许进入 Vercel Sandbox 构建阶段。",
      status: "todo",
      sortOrder: 4
    }
  ];

  const events: GeneratedRunEvent[] = [
    {
      agentName: "ProductAgent",
      eventType: "agent.completed",
      step: "product-brief",
      message: `ProductAgent 已为「${projectName}」生成项目简介。`,
      stream: "system"
    },
    {
      agentName: "ArchitectAgent",
      eventType: "agent.completed",
      step: "architecture",
      message: "ArchitectAgent 已生成技术架构和安全边界。",
      stream: "system"
    },
    {
      agentName: "PlannerAgent",
      eventType: "agent.completed",
      step: "roadmap",
      message: "PlannerAgent 已生成 Roadmap、任务和验收标准。",
      stream: "system"
    }
  ];

  return { projectName, artifacts, tasks, events };
}

export function generateContinuationHarnessBundle(input: {
  originalPrompt: string;
  changePrompt: string;
  mode: ProjectCreationInput["mode"];
  appType: ProjectCreationInput["appType"];
  sourceKind: "own_previous_run" | "cloned_workspace";
  workspaceFiles: string[];
}): HarnessBundle {
  const projectName = deriveProjectName(input.changePrompt);
  const sourceLabel = input.sourceKind === "cloned_workspace" ? "克隆项目" : "既有项目";
  const fileSummary = input.workspaceFiles.slice(0, 20).map((path) => `- ${path}`).join("\n") || "- 暂无文件索引";
  const artifacts: HarnessBundle["artifacts"] = [
    {
      type: "harness",
      title: "Project Brief",
      path: "PROJECT_BRIEF.md",
      content: `# 项目简介

## 本次修改目标

${input.changePrompt}

## 既有项目上下文

原始需求：${input.originalPrompt}

当前项目来源：${sourceLabel}。本轮必须基于已有 /workspace 文件增量开发，不从空项目重新生成。

## 当前文件摘要

${fileSummary}

## MVP 范围

- 保持现有应用结构和视觉连续性。
- 完成本次修改提示中明确要求的功能或体验调整。
- 修复因本次修改引入的构建问题。

## 不做事项

- 不重建整个项目。
- 不删除与本次修改无关的既有功能。
`
    },
    {
      type: "harness",
      title: "Architecture",
      path: "ARCHITECTURE.md",
      content: `# 架构

## 增量开发策略

本轮基于已有 Vite React TypeScript 应用继续开发。CodingAgent 必须先阅读当前 /workspace 文件，再做局部修改。

## 受影响范围

- 根据“${input.changePrompt}”定位相关页面、组件和状态逻辑。
- 保留既有构建、预览和 Sandbox 运行方式。

## Sandbox 策略

复用当前项目已有 Sandbox 和 /workspace，不执行 Vite 初始化，不覆盖现有应用骨架。
`
    },
    {
      type: "harness",
      title: "Codex Task Rules",
      path: "CODEX_TASK_RULES.md",
      content: `# CODEX 任务规则

## 增量修改规则

- 当前 /workspace 已经存在应用文件。
- 先阅读现有代码，再完成“${input.changePrompt}”。
- 不要重新初始化、重建或覆盖整个项目。
- 保持原有视觉风格和交互连续性。
- 用户可见文案优先使用简体中文。
`
    },
    {
      type: "harness",
      title: "Roadmap",
      path: "ROADMAP.md",
      content: `# 路线图

## 本次迭代

目标：在已有应用上完成“${input.changePrompt}”。

任务：
- 阅读当前文件结构。
- 修改相关组件和状态逻辑。
- 运行安装和构建检查。

验收标准：
- 既有页面仍可运行。
- 本次修改可在预览中看到。
- pnpm build 成功。
`
    },
    {
      type: "harness",
      title: "Agents",
      path: "AGENTS.md",
      content: `# AGENTS

## ProductAgent

确认本次修改目标，保留既有项目定位。

## ArchitectAgent

识别已有应用结构和本次增量影响范围。

## PlannerAgent

生成只针对本次修改的任务计划和验收标准。

## CodingAgent

在已有 /workspace 中增量修改，不重建项目。

## BuildAgent

执行安装、构建和一次自动修复。

## ReviewerAgent

总结本次增量变更、构建结果和后续建议。
`
    }
  ];

  const tasks: GeneratedTask[] = [
    {
      title: "确认本次修改目标",
      description: `围绕“${input.changePrompt}”确认增量开发范围。`,
      status: "done",
      sortOrder: 1
    },
    {
      title: "基于已有文件执行修改",
      description: "CodingAgent 将复用当前 /workspace，不重新初始化项目。",
      status: "todo",
      sortOrder: 2
    }
  ];

  const events: GeneratedRunEvent[] = [
    {
      agentName: "ProductAgent",
      eventType: "agent.completed",
      step: "product-brief",
      message: `ProductAgent 已为「${projectName}」生成增量项目简介。`,
      stream: "system"
    },
    {
      agentName: "ArchitectAgent",
      eventType: "agent.completed",
      step: "architecture",
      message: "ArchitectAgent 已生成增量架构说明和修改规则。",
      stream: "system"
    },
    {
      agentName: "PlannerAgent",
      eventType: "agent.completed",
      step: "roadmap",
      message: "PlannerAgent 已生成本次继续开发计划。",
      stream: "system"
    }
  ];

  return { projectName, artifacts, tasks, events };
}
