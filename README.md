# SMOTA Dev Agent

SMOTA 是一个 Atoms-like AI app builder 控制台。本阶段实现 Next.js + Supabase 平台骨架、邮箱密码认证、项目创建、项目内 Harness Artifact 生成，以及计划审批工作台。

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

填入 Supabase 项目的公开变量：

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```

本地开发时，Next.js 实际运行在 `apps/web` 包内，因此 `apps/web/.env.local` 必须包含 Supabase 变量。根目录 `.env.local` 可作为 workspace 级别配置保留。

启动 Web：

```bash
pnpm dev
```

默认会启动 `apps/web` 的 Next.js App Router 应用。

## Supabase 配置

在 Supabase 项目中依次执行：

- `supabase/migrations/0001_init.sql`
- `supabase/migrations/0002_rls.sql`

迁移会创建 `profiles`、`projects`、`agent_runs`、`agent_steps`、`tasks`、`artifacts`、`workspace_files`、`run_events`、`settings` 和 `sandbox_runs`。所有业务表都包含 `owner_id`，并启用 RLS，策略限制用户只能访问自己的数据。

Auth 使用 Supabase 邮箱密码注册和登录。未登录用户访问 `/dashboard`、`/projects/*` 和 `/runs/*` 会自动跳转到 `/auth/login`。

## 当前能力

- `/auth/signup`：邮箱密码注册。
- `/auth/login`：邮箱密码登录。
- `/dashboard`：Atoms 风格首页，可输入一句话创建项目。
- `/projects/[id]`：左侧 Agent Panel，右侧 Preview、Editor、Plan、Terminal、Files tabs。
- `/runs/[id]`：跳转到对应项目工作台。

项目创建会写入 `projects` 和 `agent_runs`，生成五个项目内 Harness Artifact，并记录 ProductAgent、ArchitectAgent、PlannerAgent 完成事件。批准按钮只把 run 状态更新为 `approved` 并写入 `run_events`，本阶段不会启动 Vercel Sandbox。

## Vercel 部署

当前仓库根目录 `D:\Codex Workspace\SMOTA` 就是正式项目根目录。Vercel 的 Root Directory 保持为空或指向仓库根目录即可，不再使用嵌套的 `smota-dev-agent` 目录。

在 Vercel 项目中配置 `.env.example` 中列出的环境变量。

生产环境部署在 Vercel 时，后续 Vercel Sandbox Runner 优先使用 Vercel OIDC 自动认证。本地开发如需调用 Sandbox，可通过 Vercel CLI `vercel link` 和 `vercel env pull` 获取所需环境。

安全边界：

- `SUPABASE_SERVICE_ROLE_KEY` 只能在服务端使用，不得出现在客户端代码中。
- `SUPABASE_SERVICE_ROLE_KEY` 不得传入 Sandbox。
- 只有 `NEXT_PUBLIC_*` 变量允许出现在前端。
- `OPENAI_API_KEY` 只能在服务端和 Sandbox 执行时使用。

## 暂不实现

- 不创建 Fastify API。
- 不创建 Local Runner。
- 不创建 `apps/runner`。
- 不执行 Vercel Sandbox、Codex CLI、安装、构建或 preview。

## Phase 4: Vercel Sandbox Runner

批准计划后，工作台会显示“启动 Vercel Sandbox 构建”按钮。该按钮调用服务端 API，在 Vercel Sandbox 内完成 Harness 写入、Vite React TypeScript 初始化、Codex CLI 执行、`pnpm install`、`pnpm build`、一次自动修复、文件索引、dev server 启动和 preview URL 写入。

Sandbox SDK 封装在 `packages/sandbox-runner`。前端组件不得直接调用 `@vercel/sandbox`；所有 Sandbox SDK 调用只能出现在 runner 包或服务端 Route Handler 中。

服务端 API：

- `POST /api/runs/[runId]/sandbox/start`
- `GET /api/runs/[runId]/sandbox/status`
- `POST /api/runs/[runId]/sandbox/stop`
- `GET /api/runs/[runId]/events`
- `GET /api/projects/[projectId]/files/content?path=src/App.tsx`

Sandbox workflow 会把 `sandbox_name`、`sandbox_status`、stdout/stderr、build 状态、修复状态、文件索引和 preview URL 写入 Supabase，避免函数中断后完全丢失状态。`run_events.payload` 使用 JSON；为兼容旧 UI，当前也同步写入 `metadata`。

关键环境变量：

```env
SUPABASE_SERVICE_ROLE_KEY=
SANDBOX_RUNTIME=node24
SANDBOX_TIMEOUT_MS=2700000
SANDBOX_PUBLISH_PORT=5173
CODEX_CLI_COMMAND=codex
CODEX_CLI_INSTALL_COMMAND=
CODEX_API_KEY=
OPENAI_API_KEY=
VERCEL_SANDBOX_API_TOKEN=
VERCEL_TOKEN=
VERCEL_TEAM_ID=
VERCEL_PROJECT_ID=
```

`SUPABASE_SERVICE_ROLE_KEY` 只允许服务端使用，绝不会注入 Sandbox。Sandbox 内只注入 Codex 所需的最小环境变量白名单。

`sandbox/start` 使用 Node.js runtime，并设置 `maxDuration = 300`。Vercel Sandbox 自身最长运行时间取决于 Vercel 计划：Hobby 通常最多 45 分钟，Pro/Enterprise 最多 5 小时。如果当前计划不支持长时间函数，建议把 `/sandbox/start` 降级为只创建 Sandbox 和写入初始状态，再由 Vercel Workflow、队列任务或用户手动重试 API 继续执行后续步骤。

MVP 阶段使用 Vercel Sandbox 隔离 AI 生成代码，但仍需关注网络外联、密钥注入和成本控制。后续可以增加 network policy，仅允许访问 npm registry、模型 API 和必要域名。

## Phase 4 暂不实现

- 不实现 Local Runner。
- 不依赖本地 `generated-workspaces`。
- 不创建 `apps/runner`。
- 不把生成应用发布到生产环境。
