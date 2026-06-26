import type { AppType, HarnessArtifact, ProjectCreationInput } from "@smota/shared";

function scopeByAppType(appType: AppType): string {
  const scopes: Record<AppType, string> = {
    "Web App": "面向终端用户的 Web 应用体验",
    Admin: "面向运营和管理人员的后台控制台",
    "Landing Page": "以转化为目标的展示和获客页面",
    "SaaS Demo": "可演示核心价值的 SaaS 产品原型"
  };
  return scopes[appType];
}

export function createProjectBrief(input: ProjectCreationInput): HarnessArtifact {
  const scope = scopeByAppType(input.appType);
  return {
    type: "harness",
    title: "Project Brief",
    path: "PROJECT_BRIEF.md",
    content: `# 项目简介

## 一句话需求

${input.prompt}

## 产品定位

这是一个 ${input.appType}，目标是把“${input.prompt}”转化为一个清晰、可验证、可扩展的 MVP。当前模式为 ${input.mode === "plan-first" ? "计划优先" : "快速构建"}。

## 目标用户

- 需要快速完成任务的核心业务用户
- 负责配置、查看和维护数据的管理者
- 需要在浏览器中完成主要工作流的团队成员

## 核心场景

- 用户进入应用后可以快速理解主任务。
- 用户可以围绕“${input.prompt}”完成关键流程。
- 系统提供清晰的状态反馈、空状态和错误提示。

## MVP 范围

- 实现 ${scope}。
- 提供主要页面、导航和核心表单。
- 提供基础数据模型和本地可运行体验。
- 保持界面浅色、克制、易扫描。

## 不做事项

- 不实现复杂计费、多人组织和第三方深度集成。
- 不实现与 MVP 主路径无关的高级自动化。
- 不牺牲安全边界来追求演示效果。
`
  };
}

export function createArchitecture(input: ProjectCreationInput): HarnessArtifact {
  return {
    type: "harness",
    title: "Architecture",
    path: "ARCHITECTURE.md",
    content: `# 架构

## 需求上下文

本项目来自用户需求：“${input.prompt}”。应用类型为 ${input.appType}。

## 技术栈

- Vite React TypeScript
- Tailwind CSS
- 组件化 UI
- 轻量服务端或本地 mock 数据，后续按需要替换为真实后端

## 模块

- App Shell：导航、布局、全局状态和基础错误边界。
- Domain Views：围绕“${input.prompt}”组织主要页面。
- Data Layer：集中管理数据读取、写入和 mock seed。
- UI Components：按钮、输入框、卡片、表格、状态徽标和空状态。

## 数据流

1. 用户进入首页或工作台。
2. 页面读取 mock 或 API 数据。
3. 用户提交表单或执行动作。
4. Data Layer 更新状态并反馈到 UI。
5. 错误通过页面级提示展示。

## 安全边界

- 不在客户端硬编码服务端密钥。
- 所有未来服务端密钥只通过服务端环境变量读取。
- 外部 API 调用必须通过受控服务端接口。

## Sandbox 执行策略

生成和构建只在 Vercel Sandbox 的 /workspace 内执行。Harness 文件作为 Codex CLI 的本地上下文，构建日志由平台持久化。
`
  };
}

export function createRoadmap(input: ProjectCreationInput): HarnessArtifact {
  return {
    type: "harness",
    title: "Roadmap",
    path: "ROADMAP.md",
    content: `# 路线图

## Phase 1：MVP 骨架

目标：为“${input.prompt}”创建可运行的 ${input.appType}。

任务：
- 创建应用布局和导航。
- 创建核心页面。
- 添加 mock 数据和基础交互。

验收标准：
- 本地启动无错误。
- 关键页面可访问。
- 空状态和错误状态清晰。

不做：
- 不接入复杂后端。
- 不做生产级权限系统。

## Phase 2：核心流程

目标：完成用户最常用的一条主路径。

任务：
- 实现主要表单或操作流。
- 展示状态变化。
- 增加基础校验。

验收标准：
- 用户可以完成“${input.prompt}”对应的核心任务。
- 关键交互有明确反馈。

## Phase 3：打磨与复盘

目标：提升可演示性和可维护性。

任务：
- 优化响应式布局。
- 清理组件边界。
- 补充 README 和已知问题。
`
  };
}

export function createCodexRules(input: ProjectCreationInput): HarnessArtifact {
  return {
    type: "harness",
    title: "Codex Task Rules",
    path: "CODEX_TASK_RULES.md",
    content: `# CODEX 任务规则

## 项目目标

围绕“${input.prompt}”构建 ${input.appType} MVP。

## 范围纪律

- 优先完成可演示主路径。
- 不添加与 MVP 无关的复杂功能。
- 遇到不确定需求时，选择更简单且可替换的实现。

## 代码规则

- 使用 TypeScript。
- 组件职责清晰，避免把业务逻辑堆在页面里。
- UI 保持浅色、留白充足、低对比度边框和清晰层级。

## 验证规则

- 修改后运行安装、构建或类型检查。
- 构建失败时先定位错误，再做最小修复。

## 安全规则

- 不把任何服务端密钥写入客户端代码。
- 不把敏感凭证提交到仓库。
`
  };
}

export function createAgents(input: ProjectCreationInput): HarnessArtifact {
  return {
    type: "harness",
    title: "Agents",
    path: "AGENTS.md",
    content: `# AGENTS

## ProductAgent

根据“${input.prompt}”定义目标用户、核心场景、MVP 范围和不做事项。

## ArchitectAgent

为 ${input.appType} 生成前端模块、数据流、安全边界和部署约束。

## PlannerAgent

将工作拆分为 MVP 骨架、核心流程、打磨复盘三个阶段，并为每个阶段定义验收标准。

## CodingAgent

在 Vercel Sandbox 的 /workspace 中使用 Harness 文档执行代码修改。

## BuildAgent

执行安装、构建和检查，记录 stdout/stderr。构建失败时 MVP 只允许自动修复一次。

## ReviewerAgent

总结生成变更、构建结果、已知问题和下一步建议。
`
  };
}
