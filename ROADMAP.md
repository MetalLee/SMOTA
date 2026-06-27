# 路线图

## Phase 0：Harness 文档

### 目标

创建项目 Harness 文档，用于定义产品范围、架构、路线图、Codex 规则和 Agent 工作流。

### 任务

- 创建 `PROJECT_BRIEF.md`。
- 创建 `ARCHITECTURE.md`。
- 创建 `ROADMAP.md`。
- 创建 `CODEX_TASK_RULES.md`。
- 创建 `AGENTS.md`。
- 保持仓库中不包含应用脚手架。

### 验收标准

- 5 个 Harness 文件全部存在。
- MVP 范围和不做事项清晰明确。
- 文档明确 Vercel Sandbox 是唯一 MVP Runner。
- 未创建 Next.js、Supabase、Vercel Sandbox 或任何代码工程。

### 不做什么

- 不创建 Next.js 应用。
- 不创建数据库迁移。
- 不集成 Sandbox SDK。
- 不生成应用代码。

## Phase 1：Next.js + Supabase Auth + Dashboard

### 目标

创建 Web 应用基础，包括认证和基础项目 Dashboard。

### 任务

- 初始化 TypeScript Next.js 项目。
- 配置 Supabase client 和 server helpers。
- 实现 Supabase Auth 登录/登出。
- 创建受保护的 Dashboard 路由。
- 添加 Atoms 风格的浅色、极简基础 UI 布局。

### 验收标准

- 用户可以登录和登出。
- 已认证用户可以访问 Dashboard。
- 未认证用户会被重定向到登录页。
- Supabase public keys 被安全暴露。
- Service role key 仅在服务端使用。

### 不做什么

- 不做 Sandbox Runner。
- 不执行 OpenCode CLI。
- 不集成 Monaco Editor。
- 不将生成应用部署到生产环境。

## Phase 2：项目创建 + Agent Run + Harness Artifact 生成

### 目标

允许用户通过一句话创建项目，并通过初始 agents 生成 Harness artifacts。

### 任务

- 创建 projects、agent runs、run events 和 artifacts 相关 Supabase 表。
- 为所有业务表启用 RLS。
- 实现项目创建流程。
- 创建 AgentRun 记录。
- 使用 ProductAgent、ArchitectAgent 和 PlannerAgent 生成 Harness 文档。
- 保存生成的 artifacts 和 run events。
- 增加计划批准状态。

### 验收标准

- 已登录用户可以通过 prompt 创建项目。
- 项目拥有对应的 AgentRun。
- Harness artifacts 被生成并可见。
- 编码开始前必须获得用户批准。
- RLS 阻止跨用户数据访问。

### 不做什么

- 不创建 Sandbox。
- 不在 Sandbox 内生成代码。
- 不构建或预览。

## Phase 3：Atoms 风格项目工作台

### 目标

构建项目工作台外壳，包含左侧 Agent Panel 和右侧主工作区。

### 任务

- 实现项目工作台路由。
- 构建左侧 Agent Panel。
- 构建右侧 Preview、Editor、Plan、Terminal 和 Files tabs。
- 展示 AgentRun 状态和 Harness artifacts。
- 通过 Supabase polling 或 Realtime 展示 run events。

### 验收标准

- 工作台视觉方向符合 Atoms 风格：浅色、极简、留白充足。
- Agent Panel 展示当前 agent 和步骤。
- Plan tab 展示生成计划和批准控件。
- Terminal tab 展示持久化 run events。
- Preview、Editor 和 Files 的空状态清晰。

### 不做什么

- 不执行 Sandbox 命令。
- 不做真实文件编辑。
- 不接入实时 preview iframe。

## Phase 4：Vercel Sandbox Runner

### 目标

使用 Vercel Sandbox 实现 MVP Runner。

### 任务

- 创建服务端 Sandbox 封装层。
- 基于已批准的 AgentRun 创建 Vercel Sandbox。
- 持久化 sandbox name、status、runtime、timeout 和 preview metadata。
- 将 Harness 文件写入 `/workspace`。
- 初始化 Vite React TypeScript 应用。
- 在 Sandbox 内执行 OpenCode CLI。
- 执行 `pnpm install`。
- 执行 `pnpm build`。
- 构建失败时自动修复一次。
- 将 stdout/stderr 和 step status 写入 `run_events`。

### 验收标准

- 已批准的 run 会创建 Vercel Sandbox。
- Sandbox 操作不会在 client components 中执行。
- 长时间生成任务不依赖普通 Vercel Function 本地磁盘。
- 构建状态和错误被持久化。
- 构建失败后只执行一次自动修复。

### 不做什么

- 不做 Local Runner。
- 不做 GitHub OAuth。
- 不将生成应用部署到生产环境。
- 不做多 run 队列优化。

## Phase 5：文件树、Monaco Editor、Terminal、Preview

### 目标

在工作台中展示生成应用的 artifacts。

### 任务

- 扫描 Sandbox 文件树并保存文件索引。
- 实现 Files tab。
- 实现通过 Sandbox SDK 读取文件的服务端 API。
- 添加 Monaco Editor，用于只读或受控文件查看。
- 从 `run_events` 流式展示或轮询 terminal logs。
- 在端口 `5173` 启动 Vite dev server。
- 保存并展示 Sandbox preview URL iframe。

### 验收标准

- 用户可以查看生成文件。
- 文件内容通过服务端 API 读取，而不是在客户端直接调用 Sandbox SDK。
- Terminal 展示 install/build/dev 日志。
- Preview iframe 展示 Sandbox dev server。
- 对已停止 Sandbox 的状态提供恢复或重新执行指引。

### 不做什么

- 不做复杂拖拽编辑器。
- 不做生产发布。
- 不做完整双向 IDE。

## Phase 6：Vercel 部署、成本控制、安全加固

### 目标

让 MVP 能够更安全地运行在 Vercel 和 Supabase 上。

### 任务

- 配置 Vercel 部署环境变量。
- 审查 Supabase RLS policies。
- 增加 Sandbox timeout 控制。
- 增加闲置 Sandbox 清理行为。
- 增加更清晰的错误状态和运维日志。
- 记录 Sandbox egress 风险和成本风险。
- 为后续 network policy 限制做准备。

### 验收标准

- Web Console 可部署到 Vercel。
- Secrets 作用域正确。
- Service role key 不会进入前端或 Sandbox。
- Sandbox timeouts 被执行。
- 成本和 egress 风险已文档化。
- MVP 可以端到端演示。

### 不做什么

- 不做计费。
- 不做组织空间。
- 不做多人协作。
- 不做自建 Sandbox 基础设施。

