# SMOTA

SMOTA 是一个面向开发者的 Atoms-like AI app builder。用户登录后只需要输入一句话需求，平台会先生成项目需求、技术架构和路线图，等待用户批准后，再在 Vercel Sandbox 中自动创建、编码、安装依赖、构建、预览并生成质量检视报告。

在线访问：https://smota-pi.vercel.app/

## 1. 项目概览

本项目目标不是做一个静态概念页，而是交付一个具备真实交互、数据持久化和端到端主流程的 AI 应用构建工作台。

核心使用流程：

1. 用户通过 Supabase Auth 注册 / 登录。
2. 用户在 Dashboard 输入一句话需求创建项目。
3. 平台创建项目和 AgentRun，并进入项目工作台。
4. ProductAgent、ArchitectAgent、PlannerAgent 自动生成 Harness 文档。
5. 用户批准计划后，平台启动 Vercel Sandbox。
6. Sandbox 内初始化 Vite React TypeScript 应用，调用 OpenCode CLI 生成代码。
7. BuildAgent 执行安装、构建和一次自动修复。
8. 平台保存运行日志、文件索引、预览 URL 和 Review Report。
9. 用户在工作台中查看 Preview、Plan、Terminal、Files 和只读 Editor。

项目当前覆盖了基础使用流程，并包含继续开发、项目分享、克隆、收藏、预览截图等延展能力。

## 2. 实现核心思路

SMOTA 将“一句话生成应用”拆成两段式流程：先规划，再执行。规划阶段由平台内部 Agent 生成可审阅的 Harness 文档；执行阶段只在用户批准后启动 Sandbox，避免未确认需求直接消耗构建资源。

核心取舍：

- 使用 Supabase 作为认证、数据库和运行状态持久化层，保证刷新页面后仍能恢复项目、Run、日志、文件索引和预览元数据。
- 使用 Vercel Sandbox 作为唯一 MVP Runner，把 AI 生成代码、依赖安装、构建和 dev server 隔离在受控环境内。
- Web Console 只负责编排、展示和读写数据库，不在普通 Vercel Function 本地文件系统里执行长时间代码生成任务。
- ProductAgent、ArchitectAgent、PlannerAgent 和 ReviewerAgent 通过轻量 LLMProvider 调用 DeepSeek OpenAI-compatible API，不引入 LangChain。
- CodingAgent 和 BuildAgent 在 Sandbox 内通过 OpenCode CLI、pnpm 和 Vite 完成真实代码生成与构建。
- 前端不直接调用 Sandbox SDK；文件内容读取、Sandbox 启停、预览恢复等能力都通过服务端 API 封装。
- 构建失败时 MVP 只允许一次自动修复，控制成本和复杂度。

## 3. 技术栈

- Monorepo：pnpm workspace
- Web 框架：Next.js 15、React 19、TypeScript
- UI：Tailwind CSS、lucide-react、Monaco Editor、react-markdown
- 认证与数据库：Supabase Auth、Supabase Postgres、RLS、Supabase Storage
- Runner：Vercel Sandbox、Vite React TypeScript、pnpm
- AI / Agent：DeepSeek OpenAI-compatible Chat Completions、OpenCode CLI
- 测试与类型检查：Vitest、TypeScript
- 部署：Vercel

## 4. 项目架构

```text
SMOTA
├─ apps/web
│  ├─ Next.js Web Console
│  ├─ Supabase Auth 页面与受保护路由
│  ├─ Dashboard / My Projects / Resource / Share / Project Workbench
│  └─ API routes：规划、Sandbox、事件、文件读取、workspace 状态
├─ packages/agent-core
│  ├─ ProductAgent / ArchitectAgent / PlannerAgent / ReviewerAgent
│  ├─ DeepSeek OpenAI-compatible LLMProvider
│  └─ mock / fallback Harness 生成逻辑
├─ packages/sandbox-runner
│  ├─ Vercel Sandbox 创建与恢复
│  ├─ Harness 文件写入与 Vite 初始化
│  ├─ OpenCode CLI 执行、安装、构建、自动修复
│  ├─ 文件索引、Preview dev server、截图上传
│  └─ Sandbox 安全边界与环境变量白名单
├─ packages/shared
│  └─ 跨包共享类型
├─ packages/db
│  └─ 数据库相关导出
└─ supabase/migrations
   └─ projects、agent_runs、run_events、workspace_files、sandbox_runs、分享与继续开发等表结构
```

运行时架构：

```text
Browser
  ↓
Next.js Web Console on Vercel
  ↓
Supabase Auth / Postgres / Storage / RLS
  ↓
Server API / Agent Orchestrator
  ↓
Vercel Sandbox
  ↓
OpenCode CLI + pnpm install + pnpm build + Vite dev server
```

## 5. 数据流

项目创建数据流：

1. 用户登录后输入一句话需求。
2. 服务端创建 `projects` 和 `agent_runs`，项目名先使用用户输入前十个字加 `...` 作为占位。
3. 项目详情页自动调用 `POST /api/runs/[runId]/planning/start`。
4. ProductAgent 生成正式项目名和 `PROJECT_BRIEF.md`。
5. ArchitectAgent 生成 `ARCHITECTURE.md` 和 `CODEX_TASK_RULES.md`。
6. PlannerAgent 生成 `ROADMAP.md` 并汇总 `AGENTS.md`。
7. Harness artifacts、Agent 状态和事件写入 Supabase。
8. 用户批准计划后，Run 进入 `approved_waiting_for_sandbox`。
9. 项目详情页自动调用 `POST /api/runs/[runId]/sandbox/start`。
10. 服务端创建或恢复 Vercel Sandbox，并保存 `sandbox_name`、状态和运行元数据。
11. Sandbox 写入 Harness 文件到 `/workspace`，初始化 Vite React TypeScript 应用。
12. Sandbox 执行 OpenCode CLI、依赖安装、构建；失败时执行一次自动修复。
13. stdout / stderr、构建状态、错误和 step 事件持续写入 `run_events`。
14. Runner 扫描 `/workspace` 文件树并写入 `workspace_files`。
15. Vite dev server 以 `5173` 端口启动，preview URL 写入 `agent_runs` 和 `sandbox_runs`。
16. ReviewerAgent 基于构建结果、事件、文件索引和已知问题生成中文 `REVIEW_REPORT.md`。

继续开发数据流：

1. 当最新 Run 已完成或失败时，工作台左侧输入框启用。
2. 用户输入新的修改提示后，平台为同一项目创建新的 AgentRun。
3. 普通续跑写入 `parent_run_id`；克隆项目会从已有 `sandbox_name` 和 `workspace_files` 解析可复用 workspace。
4. 新一轮规划基于原始需求、本次修改提示、上一轮 Harness 和当前文件索引生成增量计划。
5. 用户批准后复用已有持久化 Sandbox 和 `/workspace`，跳过 Vite 初始化，不覆盖原应用骨架。
6. CodingAgent 执行增量修改，BuildAgent 再次安装、构建和一次自动修复，ReviewerAgent 输出本轮报告。

## 6. MVP 已实现功能

已实现的基础主流程：

- 邮箱密码注册、登录、登出。
- 受保护路由：未登录用户访问 Dashboard、项目页等页面会跳转到登录页。
- 一句话创建项目，并立即进入项目工作台。
- 项目、Run、Artifacts、运行事件、Sandbox 元数据、文件索引、Review Report 等数据持久化到 Supabase。
- ProductAgent / ArchitectAgent / PlannerAgent 生成五个 Harness 文档。
- Harness 文档写入前会清理最外层 Markdown fence，避免展示异常。
- 用户批准计划后自动启动 Vercel Sandbox。
- Sandbox 内写入 Harness、初始化 Vite React TypeScript 应用、执行 OpenCode CLI。
- BuildAgent 执行 `pnpm install`、`pnpm build`，构建失败时只自动修复一次。
- Terminal Tab 展示 Agent、Sandbox、OpenCode、安装、构建和修复日志。
- Files Tab 以树状表格展示 Sandbox 文件索引。
- Editor Tab 使用 Monaco Editor 通过服务端 API 只读查看文件内容。
- Preview Tab 通过 iframe 展示 Sandbox dev server。
- Sandbox 预览端口恢复检查：当持久化 Sandbox 恢复但 `5173` 未监听时，服务端可重启 Vite dev server。
- ReviewerAgent 生成中文质量检视报告。
- Supabase RLS 数据隔离，业务表包含 `owner_id`。
- Service role key 仅在服务端使用，不暴露到前端，也不注入 Sandbox。

已实现的延展能力：

- 已完成或失败项目支持继续开发，基于已有 Sandbox workspace 增量修改。
- 分享项目到发现页。
- 共享项目详情页支持浏览、复制链接、收藏和克隆。
- 克隆共享项目时复制 Sandbox 文件内容和 workspace 索引，不复制源项目运行日志。
- 预览截图上传到 Supabase Storage，用于“我的项目”卡片展示。
- `/my-projects`、`/resource`、`/share/[id]` 等页面形成基础项目生态闭环。

当前未做：

- 不做 Local Runner。
- 不做 GitHub OAuth。
- 不做计费、组织空间和多人协作。
- 不做复杂拖拽编辑器。
- 不做多 Run 并发队列和完整 IDE。

## 7. 后续拓展功能规划

P0：增强 AI 生成质量

- 为 ProductAgent、ArchitectAgent、PlannerAgent 增加更细的 prompt 模板和结构化输出校验。
- 为 CodingAgent 增加生成前文件摘要和生成后变更摘要，减少覆盖已有代码的风险。
- 支持用户在批准前编辑计划或删除某些任务。
- 为 ReviewerAgent 增加截图分析、可访问性检查和更细粒度的风险分级。

P1：增强继续开发体验

- 支持多轮继续开发历史对比。
- 支持 Run 之间的文件 diff 和变更说明。
- 支持从失败 Run 选择“从上一个成功版本继续”。
- 为克隆项目增加模板化入口，让用户能基于共享项目快速二次生成。

P2：版本控制与协作能力

- 为每个项目引入版本历史，记录关键 Run 对应的文件快照、生成说明和构建结果。
- 支持版本对比、回滚和从指定版本继续开发。
- 支持 GitHub OAuth，将生成代码推送到 GitHub 仓库并保留提交历史。
- 支持项目成员、组织空间和权限管理。
- 支持评论、收藏夹分组和模板市场。

## 本地启动

安装依赖：

```bash
pnpm install
```

复制环境变量：

```bash
cp .env.example .env.local
cp .env.example apps/web/.env.local
```

本地开发时，`apps/web/.env.local` 至少需要：

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

启动 Web：

```bash
pnpm dev
```

常用检查：

```bash
pnpm typecheck
pnpm test
pnpm build
```

## 部署与环境变量

Vercel 项目配置：

- Root Directory：仓库根目录
- Framework：Next.js
- Install Command：`pnpm install --frozen-lockfile`
- Build Command：`pnpm --filter @smota/web build`
- Output Directory：`apps/web/.next`

核心环境变量：

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_PREVIEW_BUCKET=

OPENAI_API_KEY=
OPENAI_BASE_URL=https://api.deepseek.com
OPENAI_MODEL=deepseek-v4-pro
DEEPSEEK_API_KEY=

SANDBOX_RUNTIME=node24
SANDBOX_TIMEOUT_MS=2700000
SANDBOX_PUBLISH_PORT=5173

OPENCODE_CLI_COMMAND=opencode
OPENCODE_CLI_INSTALL_COMMAND=npm install -g opencode-ai
OPENCODE_MODEL=deepseek/deepseek-v4-pro

VERCEL_OIDC_TOKEN=
VERCEL_SANDBOX_API_TOKEN=
VERCEL_TOKEN=
VERCEL_TEAM_ID=
VERCEL_PROJECT_ID=
```

`NEXT_PUBLIC_*` 会暴露给浏览器。`SUPABASE_SERVICE_ROLE_KEY`、模型密钥和 Vercel token 只能配置在服务端环境中，不能传入前端或 Sandbox。Sandbox 只接收 OpenCode 运行所需的最小环境变量白名单。

## 验收路径

1. 打开在线 Demo 或本地 `http://localhost:3000`。
2. 注册并登录。
3. 在 Dashboard 输入一句话需求创建项目。
4. 进入项目工作台，等待五个 Harness 文档生成。
5. 在 Plan Tab 审阅计划并批准。
6. 等待 Sandbox 启动、OpenCode 生成代码、安装依赖并构建。
7. 在 Terminal Tab 查看持久化日志。
8. 在 Files Tab 查看生成文件树。
9. 点击文件，在 Editor Tab 查看只读文件内容。
10. 在 Preview Tab 查看生成应用。
11. Run 完成后输入新的修改提示，验证继续开发流程。
12. 将项目分享到发现页，验证分享、收藏和克隆能力。

## 当前完成程度说明

已完成：认证、项目创建、Agent 规划、计划批准、Vercel Sandbox Runner、OpenCode 执行、安装构建、一次自动修复、文件索引、只读编辑器、预览、质量报告、继续开发、分享、收藏、克隆和预览截图。

未完成：项目版本控制、多人协作、组织空间、计费、GitHub 集成、复杂拖拽编辑器、Local Runner、多 Run 队列调度和完整运维后台。

如果继续投入时间，优先级会放在三件事上：第一，提升端到端稳定性和错误恢复；第二，提高 Agent 输出质量和继续开发体验；第三，补齐项目版本控制与 GitHub 集成，让每次生成、修改和回滚都有清晰记录。
