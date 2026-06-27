# SMOTA Dev Agent

SMOTA 是一个 Atoms-like AI app builder 控制台。用户登录后用一句话创建项目，平台生成五个 Harness Artifact，用户批准计划后由 Vercel Sandbox 执行 OpenCode CLI、安装、构建、一次自动修复、文件索引和预览。

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

本地开发时，Next.js 运行在 `apps/web` 包内，因此 `apps/web/.env.local` 至少需要：

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

启动 Web：

```bash
pnpm dev
```

## Supabase 项目

1. 在 Supabase 控制台创建新项目。
2. 在 Project Settings 复制 Project URL 和 anon public key，填入 `NEXT_PUBLIC_SUPABASE_URL`、`NEXT_PUBLIC_SUPABASE_ANON_KEY`。
3. 在 Project Settings 的 API 页面复制 service role key，只填入服务端环境变量 `SUPABASE_SERVICE_ROLE_KEY`。
4. 在 SQL Editor 依次执行迁移：

```sql
-- supabase/migrations/0001_init.sql
-- supabase/migrations/0002_rls.sql
-- supabase/migrations/0003_sandbox_runner.sql
-- supabase/migrations/0004_preview_images.sql
```

迁移会创建 `projects`、`agent_runs`、`tasks`、`artifacts`、`workspace_files`、`run_events`、`sandbox_runs` 等业务表。所有业务表都包含 `owner_id` 并启用 RLS，用户只能读取和修改自己的数据。

## Supabase Auth

MVP 使用 Supabase 邮箱密码认证：

1. 在 Authentication > Providers 启用 Email。
2. 开发阶段可关闭 Confirm email，生产环境建议开启邮件确认并配置 SMTP。
3. 在 URL Configuration 设置 Site URL 为 Vercel 生产域名，本地调试添加 `http://localhost:3000` 到 Redirect URLs。

未登录用户访问 `/dashboard`、`/resource`、`/my-projects`、`/projects/*`、`/runs/*` 会跳转到 `/auth/login`。

## Vercel 部署

仓库根目录包含 `vercel.json`。在 Vercel 创建项目时：

1. Root Directory 保持仓库根目录。
2. Framework 使用 Next.js。
3. Install Command 使用 `pnpm install --frozen-lockfile`。
4. Build Command 使用 `pnpm --filter @smota/web build`。
5. Output Directory 使用 `apps/web/.next`。

必须配置的环境变量：

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
PREVIEW_SCREENSHOT_WIDTH=1280
PREVIEW_SCREENSHOT_HEIGHT=720
PREVIEW_SCREENSHOT_TIMEOUT_MS=30000
PREVIEW_SCREENSHOT_SETTLE_MS=1500

OPENCODE_CLI_COMMAND=opencode
OPENCODE_CLI_INSTALL_COMMAND=npm install -g opencode-ai
OPENCODE_MODEL=deepseek/deepseek-v4-pro

VERCEL_OIDC_TOKEN=
VERCEL_SANDBOX_API_TOKEN=
VERCEL_TOKEN=
VERCEL_TEAM_ID=
VERCEL_PROJECT_ID=
```

`NEXT_PUBLIC_*` 会暴露给浏览器。`SUPABASE_SERVICE_ROLE_KEY`、模型密钥和 Vercel token 只能配置为服务端环境变量。`SUPABASE_PREVIEW_BUCKET` 是 Supabase Storage bucket 名称，bucket 需要公开访问。ReviewAgent 会在 Runner 上使用 Playwright Chromium 截图，Runner 上传 `image/png` 并将公开 URL 写入 `sandbox_runs.preview_image_url`。

Runner 环境必须安装 Playwright Chromium：

```bash
pnpm --filter @smota/sandbox-runner exec playwright install chromium
```

仓库根 `postinstall` 会自动执行该安装步骤；如果部署环境禁用了 lifecycle scripts，需要在安装后手动运行上面的命令。

Vercel Web Console 的服务端函数也必须能解析 `playwright` 包。`@smota/web` 直接声明 `playwright` 依赖，并在 Next.js 服务端构建中将 `playwright` / `playwright-core` 外部化，避免 webpack 内联 Playwright 内部 bundle，同时保证截图运行时可以从部署包加载该依赖。

SMOTA 内置 LLM 默认使用 DeepSeek v4 Pro。DeepSeek API 兼容 OpenAI Chat Completions，因此这里复用 `OPENAI_API_KEY`、`OPENAI_BASE_URL` 和 `OPENAI_MODEL` 变量。`OPENAI_API_KEY` 可以直接填写 DeepSeek API key；也可以使用 `DEEPSEEK_API_KEY`。远程 Sandbox 会为 OpenCode 同时注入 `DEEPSEEK_API_KEY` 和 OpenAI-compatible 变量。

## Vercel Sandbox

MVP 不需要 Local Runner。所有 AI 生成代码、依赖安装、构建和 dev server 都运行在 Vercel Sandbox 内，Web Console 只负责创建和控制 Sandbox，并把状态写入 Supabase。

工作流：

1. 用户批准计划。
2. `POST /api/runs/[runId]/sandbox/start` 创建 Vercel Sandbox。
3. 服务端写入 Harness 文件到 `/workspace`。
4. Sandbox 初始化 Vite React TypeScript 应用。
5. Sandbox 执行 OpenCode CLI。
6. Sandbox 执行 `pnpm install` 和 `pnpm build`。
7. 构建失败时只执行一次 OpenCode 自动修复。
8. 扫描 `/workspace` 文件树，写入 `workspace_files`。
9. 写入 `smota.vite.config.ts` preview overlay，并启动 `pnpm dev --config smota.vite.config.ts --host 0.0.0.0 --port 5173 --strictPort`。
10. 保存 `agent_runs.sandbox_preview_url` 和 `sandbox_runs.preview_url`。
11. ReviewAgent 在 Runner 上校验 Playwright Chromium 是否存在。
12. ReviewAgent 在 Runner 上使用 Playwright Chromium 对 Sandbox preview URL 截图。
13. Runner 将 PNG 上传到 `SUPABASE_PREVIEW_BUCKET`，路径为 `{owner_id}/{project_id}/{run_id}/preview.png`。
14. 保存公开图片 URL 到 `sandbox_runs.preview_image_url`，`/my-projects` 卡片可直接展示。

`smota.vite.config.ts` 会 merge 生成应用的 `vite.config.ts`，并为 Sandbox preview 设置 `server.allowedHosts: true`，以接受 Vercel Sandbox 动态预览域名的 Host header。

前端不能直接调用 `@vercel/sandbox`。文件内容通过服务端 API 读取：

```text
GET /api/projects/[projectId]/files/content?path=src/App.tsx
```

### 本地对接 Supabase Storage

远程 Supabase：

1. 在 Supabase Dashboard 创建公开 bucket，例如 `smota-previews`。
2. 本地 `.env.local` 和 `apps/web/.env.local` 配置：

```env
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
SUPABASE_PREVIEW_BUCKET=smota-previews
```

3. 执行迁移到远程数据库，确保 `sandbox_runs.preview_image_url` 存在。
4. 本地触发 Sandbox workflow 前，先运行 `pnpm --filter @smota/sandbox-runner exec playwright install chromium`，确保本地 Runner 有 Chromium。
5. 本地触发 Sandbox workflow 时，ReviewAgent 在 Runner 上截图；Runner 使用 service role key 上传截图到 bucket，并通过 `getPublicUrl()` 生成图片 URL。

本地 Supabase CLI：

1. 安装 Docker 和 Supabase CLI。
2. 在项目根目录运行 `supabase init`（如果尚未初始化）和 `supabase start`。
3. 使用 `supabase status` 查看本地 API URL、anon key、service role key 和 Studio URL。
4. 在本地 Studio 的 Storage 中创建公开 bucket，或在 `supabase/config.toml` 中定义 bucket。
5. 配置本地环境变量：

```env
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<local-anon-key>
SUPABASE_SERVICE_ROLE_KEY=<local-service-role-key>
SUPABASE_PREVIEW_BUCKET=smota-previews
```

公开 bucket 的图片 URL 形式为 `/storage/v1/object/public/<bucket>/<path>`；SDK 会用 `getPublicUrl()` 生成完整 URL。

## OpenCode CLI

默认命令是：

```env
OPENCODE_CLI_COMMAND=opencode
OPENCODE_MODEL=deepseek/deepseek-v4-pro
```

Sandbox 内的 CodingAgent 使用 OpenCode 非交互模式：

```bash
opencode run --model deepseek/deepseek-v4-pro --agent build --dangerously-skip-permissions "<prompt>"
```

Sandbox 内的 OpenCode CLI 默认使用 DeepSeek v4 Pro：

```env
OPENAI_BASE_URL=https://api.deepseek.com
OPENAI_MODEL=deepseek-v4-pro
OPENAI_API_KEY=<DeepSeek API key>
DEEPSEEK_API_KEY=<DeepSeek API key>
```

如果 Sandbox 镜像里没有 OpenCode CLI，配置安装命令：

```env
OPENCODE_CLI_INSTALL_COMMAND=npm install -g opencode-ai
```

如果启动后 Terminal Tab 显示 `OpenCode CLI not found in Vercel Sandbox`：

1. 确认 `OPENCODE_CLI_COMMAND` 与实际二进制名称一致。
2. 确认 `OPENCODE_CLI_INSTALL_COMMAND` 可以在 node24 Sandbox 中非交互执行。
3. 确认模型 API key 已配置为 `DEEPSEEK_API_KEY` 或 `OPENAI_API_KEY`。
4. 查看 Terminal Tab 的 `install_opencode_cli` 和 `check_opencode_cli` 输出。
5. 如果模型不可用，运行 `opencode models deepseek --refresh` 检查 provider/model 名称。

`SUPABASE_SERVICE_ROLE_KEY` 永远不会注入 Sandbox。Sandbox 环境变量只允许 OpenCode 运行所需的最小白名单。

## Agent LLM 接口

后续 ProductAgent、ArchitectAgent、PlannerAgent、CodingAgent、BuildAgent 和 ReviewerAgent 接入真实 LLM 时，统一从 `packages/agent-core/src/llm.ts` 获取 LangChain 模型：

```ts
import { createAgentChatModel } from "@smota/agent-core";

const model = createAgentChatModel();
```

该工厂返回 `@langchain/openai` 的 `ChatOpenAI` 实例，默认配置为：

- provider：`deepseek`
- model：`deepseek-v4-pro`
- base URL：`https://api.deepseek.com`
- temperature：`0.2`

如需切到网关或其他 DeepSeek 兼容端点，只覆盖 `OPENAI_BASE_URL` 和 `OPENAI_MODEL`。不要在 Agent 代码里直接读取或传播 `SUPABASE_SERVICE_ROLE_KEY`。

## 工作台

主导航路由关系：

- `/dashboard`：首页。
- `/resource`：资源。
- `/my-projects`：我的项目。

左侧菜单根据当前 top-level route 高亮对应项，项目详情页仍通过“最近”项目入口进入。

`/my-projects` 使用卡片形式展示项目。卡片包含预览图、项目名、更新日期和三个点菜单；菜单仅包含“在浏览器打开”、“复制链接”、“删除”。删除需要弹窗确认。项目截图 URL 保存到 `sandbox_runs.preview_image_url`，Sandbox 构建完成并启动 preview 后会由 Runner 使用 Playwright Chromium 截图并写入该字段；字段为空时显示浅灰占位预览。

`/projects/[id]` 包含：

- 左侧 Agent Panel：项目名、原始需求、run 状态、Sandbox 状态、Agent timeline、task checklist、批准计划、启动 Sandbox、停止 Sandbox、刷新状态。
- Terminal Tab：轮询 `run_events`，展示 Agent 状态、Sandbox 创建状态、OpenCode 输出、`pnpm install`、`pnpm build`、自动修复、preview ready。stdout 和 stderr 使用不同轻量样式。
- Files Tab：读取 `workspace_files`，展示 path、file_type、change_type、size、last_modified_at。点击文件进入 Editor Tab。
- Editor Tab：使用 Monaco Editor 只读展示 Sandbox 文件内容。
- Preview Tab：读取 `agent_runs.sandbox_preview_url`，有 URL 时 iframe 展示，无 URL 时提示等待 Sandbox 启动应用预览。
- Plan Tab：使用 `react-markdown` 展示五个 Harness Artifact 和 Review Report。

Editor Tab 会显示以下固定错误：

- `Sandbox not ready`
- `Sandbox stopped`
- `File too large`
- `Binary file is not supported`
- `Invalid file path`

## 成本、超时和安全风险

Vercel Sandbox 会产生运行成本。OpenCode 执行、依赖安装、构建和 dev server 都会消耗时间，`SANDBOX_TIMEOUT_MS=2700000` 表示 45 分钟。不同 Vercel 计划的函数时长、Sandbox 时长和并发限制不同，端到端生成可能因为超时中断。

MVP 当前不做 Local Runner，也不把生成应用发布到生产环境。这样可以把不可信代码限制在 Vercel Sandbox 内，但仍需注意：

- Sandbox 可能访问外部网络，后续应增加 network policy。
- OpenCode、DeepSeek API 调用和 npm install 会产生模型和网络成本。
- 预览服务可能因 Sandbox 停止或过期不可用。
- Service role key 会绕过 RLS，绝不能暴露给前端，也不能传入 Sandbox。

## 验收路径

1. 访问 Vercel 部署域名。
2. 注册并登录。
3. 在 Dashboard 创建项目。
4. 打开项目页，确认五个 Harness Artifact 已生成。
5. 批准计划。
6. 启动 Vercel Sandbox 构建。
7. 在 Terminal Tab 查看 Sandbox 日志。
8. 在 Files Tab 查看生成文件。
9. 点击文件，在 Editor Tab 读取只读内容。
10. 在 Preview Tab 查看 Sandbox dev server URL。
