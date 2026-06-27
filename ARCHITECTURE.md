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

部署在 Vercel 上的 Next.js 应用，提供认证、Dashboard、项目创建、运行批准、Agent Panel、Preview、Editor、Plan、Terminal 和 Files 视图。

### API Layer

服务端 API routes 或 server actions 负责协调 Supabase 写入、Sandbox 创建、Sandbox 命令执行、文件读取和 run 状态更新。

### Supabase

Supabase 提供 Auth、Postgres、RLS，以及 Realtime 或基于 polling 的事件展示能力。它是用户、项目、AgentRun、Sandbox 元数据、run events、文件索引和 Review Report 的事实来源。

### Vercel Sandbox Runner

Runner 负责创建和控制 Vercel Sandbox。它写入 Harness 文件、初始化生成应用、注入仅运行时使用的密钥、调用 OpenCode CLI、执行包管理命令、暴露 dev server 端口，并把状态回写到 Supabase。

### Agent Orchestrator

编排 ProductAgent、ArchitectAgent、PlannerAgent、CodingAgent、BuildAgent 和 ReviewerAgent。每个步骤都要持久化为事件和可恢复的 run 状态。

## 数据流

1. 用户通过 Supabase Auth 登录。
2. 用户用一句话 prompt 创建项目。
3. 平台创建 `projects` 记录和 `agent_runs` 记录。
4. ProductAgent、ArchitectAgent 和 PlannerAgent 生成 Harness artifacts。
5. 用户批准计划。
6. 服务端 API 创建 Vercel Sandbox。
7. Sandbox 元数据写入 Supabase。
8. Harness 文件写入 Sandbox 内的 `/workspace`。
9. 在 Sandbox 内初始化 Vite React TypeScript 应用。
10. 在 Sandbox 内执行 OpenCode CLI。
11. 在 Sandbox 内执行 `pnpm install` 和 `pnpm build`。
12. 如果构建失败，执行一次自动修复。
13. 运行日志、状态和构建输出写入 `run_events`。
14. 扫描文件树并持久化到 Supabase。
15. 在 Sandbox 内启动 `pnpm dev --host 0.0.0.0 --port 5173`。
16. 保存 preview URL，并在 Web Console 的 iframe 中展示。
17. ReviewerAgent 生成 Review Report。

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
- 页面组件不能直接调用 Sandbox SDK。

## Sandbox Preview 端口策略

- MVP 使用单一默认发布端口：`5173`。
- Vite 使用 `pnpm dev --config smota.vite.config.ts --host 0.0.0.0 --port 5173 --strictPort` 运行。
- Runner 在启动 preview 前写入 `smota.vite.config.ts`，merge 生成应用的 `vite.config.ts` 并设置 `server.allowedHosts: true`，允许 Vercel Sandbox 动态预览域名访问 dev server。
- 发布后的 preview URL 保存到 `sandbox_runs.preview_url` 和 `agent_runs.sandbox_preview_url`。
- ReviewAgent 只在生成应用 `pnpm build` 成功且 dev server 已启动后截图，不能对 `init_vite` 后的默认 Vite Home 截图。
- 截图命令在 Vercel Sandbox 内执行，使用 `playwright install chromium --only-shell` 安装 headless shell 后将 PNG 写入临时路径；Web Function 只通过 Sandbox SDK 读取 PNG bytes，并用 service role 上传到 Supabase Storage，公开图片 URL 保存到 `sandbox_runs.preview_image_url`。
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
