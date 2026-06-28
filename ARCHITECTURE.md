# 架构

## 总览

```text
Vercel Next.js Web Console
  ↓
Supabase Auth / Postgres / RLS / Realtime or Polling
  ↓
Vercel Sandbox Runner
  ↓
Sandbox 内部执行：
  - 写入 Harness 文件
  - 初始化 Vite React 项目
  - 调用 OpenCode CLI
  - pnpm install
  - pnpm build
  - pnpm dev --host 0.0.0.0 --port 5173
```

## 关键架构原则

- Web 控制台部署在 Vercel。
- 用户认证使用 Supabase Auth。
- 平台数据持久化使用 Supabase Postgres。
- 所有业务表必须启用 RLS。
- Vercel Sandbox 是 MVP 唯一 Runner。
- MVP 不做 Local Runner。
- 不把长时间代码生成任务直接放在普通 Vercel Function 的本地文件系统里执行。
- Vercel Function 只负责创建和控制 Sandbox。
- 不可信代码或 AI 生成代码在 Sandbox 内执行。
- Sandbox 的 stdout/stderr、Agent 状态和构建结果写入 Supabase `run_events`。
- Web 端通过 Supabase 查询或订阅展示实时日志。
- Sandbox 名称、状态、preview URL 和构建结果写入 Supabase。
- 文件内容保存在 Sandbox 内；平台只保存文件索引和必要的只读文件内容快照。
- 如果需要查看代码，Web API 通过 Sandbox SDK 读取文件内容。
- 如果 Sandbox 已停止，应通过保存的 sandbox name 恢复，或提示用户重新执行。

## 系统模块

### Web Console

部署在 Vercel 上的 Next.js 应用，提供认证、Dashboard、项目创建、运行批准、Agent Panel、概览、应用预览器、编辑器、终端和文件视图。

### API Layer

服务端 API routes 或 server actions 负责协调 Supabase 写入、Sandbox 创建、Sandbox 命令执行、文件读取和 run 状态更新。

### Supabase

Supabase 提供 Auth、Postgres、RLS，以及 Realtime 或基于 polling 的事件展示能力。它是用户、项目、AgentRun、Sandbox 元数据、run events、文件索引和 Review Report 的事实来源。

`tasks` 表是计划任务和执行进度的唯一事实来源。`ROADMAP.md` 只作为用户可读的计划说明，不能作为独立任务状态来源；`agent_runs` 表示整体运行生命周期。只有分配给 CodingAgent 的任务由 CodingAgent 通过 HTTP 回写 `tasks.status` 并与 Agent 运行状态解绑；其他任务仍按 `agent_name` 对应 Agent 的运行状态展示进度。

### Vercel Sandbox Runner

Runner 负责创建和控制 Vercel Sandbox。它写入 Harness 文件、初始化生成应用、注入仅运行时使用的密钥、调用 OpenCode CLI、执行包管理命令、暴露 dev server 端口，并把状态回写到 Supabase。

### Agent Orchestrator

编排 ProductAgent、ArchitectAgent、PlannerAgent、CodingAgent、BuildAgent 和 ReviewerAgent。每个步骤都要持久化为事件和可恢复的 run 状态。

ProductAgent、ArchitectAgent、PlannerAgent 和 ReviewerAgent 默认通过 `packages/agent-core` 直接调用 DeepSeek OpenAI-compatible Chat Completions API，不经过 LangChain。LLM 调用由轻量 `LLMProvider` 封装，默认读取 `DEEPSEEK_API_KEY` 或 `OPENAI_API_KEY`，并使用 `OPENAI_BASE_URL=https://api.deepseek.com` 和 `OPENAI_MODEL=deepseek-v4-pro`。
在中文环境下，ProductAgent、ArchitectAgent、PlannerAgent、CodingAgent 和 ReviewerAgent 的用户可见输出必须使用简体中文；技术标识、文件名、命令、代码、API 名称和专有模型名可以保留英文。

模型流式返回中的 `reasoning_content` 不写入 `run_events`，也不在 Web 工作台展示。Web 工作台的 Terminal Tab 展示已持久化的系统事件、stdout/stderr、构建和 Sandbox 日志。不要把系统提示词、服务端密钥或 Supabase service role key 写入 Sandbox 或前端。

## 数据流

1. 用户通过 Supabase Auth 登录。
2. 用户用一句话 prompt 创建项目。
3. 平台创建 `projects` 记录和 `agent_runs` 记录，`projects.name` 先使用用户输入前十个字加 `...` 作为占位名，并立即跳转到项目详情页。
4. 项目详情页自动调用 `POST /api/runs/[runId]/planning/start` 启动 ProductAgent、ArchitectAgent 和 PlannerAgent。
5. ProductAgent、ArchitectAgent 和 PlannerAgent 逐步生成 Harness artifacts，写入 Supabase 后概览 tab 通过工作区轮询实时显示变化。
   - ProductAgent 生成项目名称并写入 `projects.name`，同时生成 `PROJECT_BRIEF.md`。
   - ArchitectAgent 生成 `ARCHITECTURE.md` 和 `CODEX_TASK_RULES.md`。
   - PlannerAgent 生成 `ROADMAP.md`，并汇总 `AGENTS.md`。
6. 用户批准计划。
7. 项目详情页检测到 run 进入 `approved_waiting_for_sandbox` 后，自动调用服务端 API 创建 Vercel Sandbox。
8. Sandbox 元数据写入 Supabase。
9. Harness 文件写入 Sandbox 内的 `/workspace`。
10. 在 Sandbox 内初始化 Vite React TypeScript 应用。
11. 在 Sandbox 内执行 OpenCode CLI。
12. CodingAgent 只接收 `tasks` 表中 `agent_name = CodingAgent` 的任务 ID，并通过受控 HTTP API 回写这些任务的 `tasks.status`。
13. 在 Sandbox 内执行 `pnpm install` 和 `pnpm build`。
14. 如果构建失败，执行一次自动修复。
15. 运行日志、状态和构建输出写入 `run_events`。
16. 扫描文件树并持久化到 Supabase。
17. 在 Sandbox 内启动 `pnpm dev --host 0.0.0.0 --port 5173`。
18. 保存 preview URL，并在 Web Console 的 iframe 中展示。
19. ReviewerAgent 生成中文质量检视报告。

ReviewerAgent 在构建成功、文件索引完成后运行。它读取 build result、run events、workspace file index、preview URL 和已知问题，通过直接 LLM API 生成中文 `REVIEW_REPORT.md`；如果 LLM 不可用，则生成确定性中文 fallback 报告。

## 继续开发数据流

当项目当前 Run 处于 `succeeded` 或 `failed` 时，项目详情页左侧输入框允许用户输入新的修改提示。平台会为同一项目创建新的 `agent_runs`，写入 `parent_run_id` 指向当前 Run，并解析可复用的 workspace 来源：

- 普通已生成项目优先复用当前 Run 或最近可用 Run 的 `sandbox_name` 和 `workspace_files`。
- 从发现克隆来的项目可能没有语义上的父生成 Run，但只要存在克隆时写入的 Sandbox 文件索引，也必须按已有 workspace 进行增量开发。

新的 Run 仍按 ProductAgent、ArchitectAgent、PlannerAgent、CodingAgent、BuildAgent、ReviewerAgent 顺序执行。规划 Prompt 会包含原始需求、本次修改提示、上一轮 Harness artifact（如果存在）和当前文件索引。Sandbox 阶段如果已解析到可复用 `sandbox_name`，Runner 使用 `Sandbox.get` 恢复同一个持久化 Sandbox，跳过 Vite 初始化，不覆盖 `/workspace`，只写入本轮 Harness 文件并执行 OpenCode 增量修改、安装、构建、一次自动修复和质量检视。

## 部署架构

- Next.js Web Console：Vercel。
- Database/Auth/Realtime：Supabase。
- Runner：由服务端 Vercel Functions 创建和控制的 Vercel Sandbox。
- 生成应用执行环境：仅 Vercel Sandbox。
- Preview：Sandbox 暴露的 dev server URL，嵌入工作台 iframe。

普通 Vercel Functions 应保持为编排入口，不应成为 AI 生成项目的长时间执行环境。

## 安全边界

- 浏览器客户端只能使用 `NEXT_PUBLIC_SUPABASE_URL` 和 `NEXT_PUBLIC_SUPABASE_ANON_KEY`。
- `SUPABASE_SERVICE_ROLE_KEY` 只能在服务端使用。
- `SUPABASE_SERVICE_ROLE_KEY` 不能暴露给前端。
- `SUPABASE_SERVICE_ROLE_KEY` 不能注入 Sandbox。
- 用户私密数据不能直接写入 Sandbox。
- OpenCode CLI 所需 API Key 只在 Sandbox 执行时注入。
- AI 生成代码和不可信代码运行在 Vercel Sandbox 内，而不是 Web Console runtime 内。
- 后续可使用 Vercel Sandbox network policy 限制外联域名。
- MVP 阶段至少要在文档和 UI 中说明 Sandbox egress 风险和成本风险。

## Supabase 表设计草案

### `projects`

- `id uuid primary key`
- `owner_id uuid not null references auth.users(id)`
- `name text not null`
- `description text`
- `status text default 'draft'`
- `created_at timestamptz default now()`
- `updated_at timestamptz default now()`

### `agent_runs`

- `id uuid primary key`
- `owner_id uuid not null references auth.users(id)`
- `project_id uuid not null references projects(id)`
- `parent_run_id uuid references agent_runs(id)`
- `status text not null`
- `current_agent text`
- `current_step text`
- `input_prompt text`
- `approved_at timestamptz`
- `runner_provider text default 'vercel_sandbox'`
- `sandbox_name text`
- `sandbox_status text`
- `sandbox_runtime text default 'node24'`
- `sandbox_timeout_ms integer`
- `sandbox_preview_url text`
- `build_status text`
- `build_error text`
- `fix_attempted boolean default false`
- `created_at timestamptz default now()`
- `updated_at timestamptz default now()`

### `sandbox_runs`

- `id uuid primary key`
- `owner_id uuid not null references auth.users(id)`
- `project_id uuid not null references projects(id)`
- `run_id uuid not null references agent_runs(id)`
- `sandbox_name text not null`
- `status text not null`
- `runtime text default 'node24'`
- `timeout_ms integer`
- `publish_port integer default 5173`
- `preview_url text`
- `last_error text`
- `created_at timestamptz default now()`
- `updated_at timestamptz default now()`

### `run_events`

- `id uuid primary key`
- `owner_id uuid not null references auth.users(id)`
- `project_id uuid not null references projects(id)`
- `run_id uuid not null references agent_runs(id)`
- `agent_name text`
- `event_type text not null`
- `step text`
- `message text`
- `stream text`
- `metadata jsonb default '{}'::jsonb`
- `created_at timestamptz default now()`

### `tasks`

- `id uuid primary key`
- `owner_id uuid not null references auth.users(id)`
- `project_id uuid not null references projects(id)`
- `run_id uuid references agent_runs(id)`
- `title text not null`
- `description text`
- `status text not null default 'todo'`
- `agent_name text`
- `sort_order integer not null default 0`
- `created_at timestamptz default now()`
- `updated_at timestamptz default now()`

`status` 允许值由服务端代码约束为 `todo`、`in_progress`、`done`、`failed`。CodingAgent 只能通过 `POST /api/runs/[runId]/tasks/[taskId]/status` 更新当前 Run 下 `agent_name = CodingAgent` 的任务；该接口只更新 `tasks.status` 并写入 `run_events`，不更新 `agent_runs.status`。非 CodingAgent 任务不传入 OpenCode，工作台继续根据对应 Agent 状态展示进度。

### `project_files`

- `id uuid primary key`
- `owner_id uuid not null references auth.users(id)`
- `project_id uuid not null references projects(id)`
- `run_id uuid references agent_runs(id)`
- `path text not null`
- `kind text not null`
- `size_bytes integer`
- `content_snapshot text`
- `snapshot_readonly boolean default true`
- `created_at timestamptz default now()`
- `updated_at timestamptz default now()`

### `review_reports`

- `id uuid primary key`
- `owner_id uuid not null references auth.users(id)`
- `project_id uuid not null references projects(id)`
- `run_id uuid not null references agent_runs(id)`
- `summary text`
- `build_status text`
- `next_steps text`
- `created_at timestamptz default now()`

所有业务表都必须包含 `owner_id`，并启用 RLS policy，将读写限制在认证用户自己的数据范围内。只有服务端受控操作可以使用 service role key。

## Vercel Sandbox 工作方式

Web Console 调用服务端 API 创建和控制 Sandbox。服务端将 `sandbox_name`、runtime、timeout、status 和 preview URL 存入 Supabase。命令在 Sandbox 的 `/workspace` 内执行。

Sandbox 负责：

- 写入 Harness 文件。
- 初始化 Vite React TypeScript 项目。
- 对继续开发 Run 复用已有 `/workspace`，不重新初始化 Vite，不覆盖现有应用骨架。
- 执行 OpenCode CLI。
- 安装依赖。
- 执行生产构建。
- 构建失败后自动修复一次。
- 在端口 `5173` 启动 dev server。
- 扫描文件树。

## Sandbox 生命周期

1. `pending`：AgentRun 已创建，等待用户批准。
2. `creating`：服务端正在创建 Vercel Sandbox。
3. `ready`：Sandbox 已创建，可以写入文件和执行命令。
4. `generating`：OpenCode CLI 或 agents 正在修改代码。
5. `installing`：正在安装依赖。
6. `building`：正在执行构建命令。
7. `fixing`：构建失败后正在执行一次自动修复。
8. `previewing`：dev server 已运行，preview URL 可用。
9. `failed`：运行失败，无法继续自动处理。
10. `stopped`：Sandbox 已停止或过期。

## Sandbox 文件读写方式

- 服务端 API 将 Harness 文件写入 `/workspace`。
- 生成应用的文件保留在 Sandbox 文件系统内。
- 平台在 Supabase 中保存文件索引和选定的只读快照。
- 用户打开文件时，Web API 通过 Sandbox SDK 读取文件内容。
- Web Console 的文件 tab 按目录层级将 `workspace_files` 渲染为树状表格，目录行用于结构浏览，文件行可跳转到编辑器只读打开。
- 页面组件不能直接调用 Sandbox SDK。

## Sandbox Preview 端口策略

- MVP 使用单一默认发布端口：`5173`。
- Vite 使用 `pnpm dev --config smota.vite.config.ts --host 0.0.0.0 --port 5173 --strictPort` 运行。
- Runner 在启动 preview 前写入 `smota.vite.config.ts`，merge 生成应用的 `vite.config.ts` 并设置 `server.allowedHosts: true`，允许 Vercel Sandbox 动态预览域名访问 dev server。
- 当持久化 Sandbox 被 Vercel 冷启动或恢复后，原 detached `pnpm dev` 进程可能不会自动复活。项目详情页在每个 preview URL 上最多自动触发一次 `sandbox/status?ensurePreview=1`，手动刷新可强制重试；服务端将端口探测、必要时重启 `pnpm dev`、等待 `127.0.0.1:5173` 就绪合并为单个 Sandbox 命令，并记录 `dev_server_recover` / `preview_recovered` 事件。预览健康标准必须是 `curl http://127.0.0.1:5173/` 成功，不能仅凭进程匹配判断 ready。
- 发布后的 preview URL 保存到 `sandbox_runs.preview_url` 和 `agent_runs.sandbox_preview_url`。
- ReviewAgent 只在生成应用 `pnpm build` 成功且 dev server 已启动后截图，不能对 `init_vite` 后的默认 Vite Home 截图。
- 截图命令在 Vercel Sandbox 内执行，先通过 `dnf` 安装 Chromium headless shell 所需的 `nspr`、`nss` 等系统运行库，再使用 `playwright install chromium --only-shell` 安装 headless shell 后将 PNG 写入临时路径；Web Function 只通过 Sandbox SDK 读取 PNG bytes，并用 service role 上传到 Supabase Storage，公开图片 URL 保存到 `sandbox_runs.preview_image_url`。
- Web Console 在 iframe 中嵌入 preview URL。

## Vercel 环境变量

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_PREVIEW_BUCKET`
- `DEEPSEEK_API_KEY`
- `OPENAI_API_KEY`
- `OPENAI_BASE_URL=https://api.deepseek.com`
- `OPENAI_MODEL=deepseek-v4-pro`
- `SANDBOX_RUNTIME=node24`
- `SANDBOX_TIMEOUT_MS`
- `SANDBOX_PUBLISH_PORT=5173`
- `PREVIEW_SCREENSHOT_WIDTH=1280`
- `PREVIEW_SCREENSHOT_HEIGHT=720`
- `PREVIEW_SCREENSHOT_TIMEOUT_MS=30000`
- `PREVIEW_SCREENSHOT_SETTLE_MS=1500`
- `OPENCODE_CLI_COMMAND=opencode`
- `OPENCODE_CLI_INSTALL_COMMAND=npm install -g opencode-ai`
- `OPENCODE_MODEL=deepseek/deepseek-v4-pro`
- `SMOTA_APP_URL`
- `SMOTA_TASK_UPDATE_SECRET`
- `VERCEL_OIDC_TOKEN`
- `VERCEL_SANDBOX_API_TOKEN`
- `VERCEL_TOKEN`
- `VERCEL_TEAM_ID`
- `VERCEL_PROJECT_ID`

只有服务端代码可以访问非公开环境变量。

## Supabase 环境变量

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- 用于迁移和服务端管理的数据库连接字符串。

Anon key 可在开启 RLS 的前提下安全用于浏览器。Service role key 会绕过 RLS，必须只在服务端使用。

## OpenCode CLI 配置方式

- OpenCode CLI 只在 Vercel Sandbox 内执行。
- 所需 API key 在命令执行时注入 Sandbox 环境。
- OpenCode CLI 使用项目 Harness 文件作为本地上下文。
- OpenCode CLI Prompt 必须只把 `tasks` 表中 `agent_name = CodingAgent` 的任务 ID、状态和 agentName 作为唯一任务清单传入，避免 OpenCode 再生成一套不可跟踪的任务分解。
- CodingAgent 每开始、完成或放弃一个 CodingAgent 任务时，必须用 Sandbox 环境中的 `SMOTA_TASK_UPDATE_TOKEN` 调用任务状态 API 回写 `tasks.status`。
- OpenCode CLI 必须将变更写入 `/workspace`。
- OpenCode CLI 输出流式写入 `run_events`。
- Sandbox 不能接收 Supabase service role 凭证。

## 成本控制策略

- 为每次 run 设置 Sandbox timeout。
- 在 `agent_runs` 保存 `sandbox_timeout_ms`，在 `sandbox_runs` 保存 `timeout_ms`。
- MVP 将自动修复次数限制为一次。
- 通过 `run_events` 追踪 install/build 时长和失败率。
- 停止或过期处理闲置 Sandbox。
- 当 Realtime 成本或连接数变高时，优先考虑 polling。
- 避免在 Supabase 中保存完整生成项目内容。
- 在产品文案和运维文档中说明 Sandbox egress 和依赖安装成本。
- 后续为 package registry 和已批准的 AI/API endpoint 添加 network policy 限制。
