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
