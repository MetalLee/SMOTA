# CODEX 任务规则

这些规则适用于本仓库后续所有 Codex 开发工作。

## 每次开发前必须阅读

开始修改前，Codex 必须阅读：

- `PROJECT_BRIEF.md`
- `ARCHITECTURE.md`
- `ROADMAP.md`
- `CODEX_TASK_RULES.md`
- `AGENTS.md`

## 范围纪律

- 每次只完成一个明确阶段。
- 不要一次性实现所有功能。
- 不要在没有用户明确批准的情况下扩大 MVP 范围。
- 不要实现 Local Runner。
- Runner MVP 只能使用 Vercel Sandbox。
- 每次有实质改动后，更新 README 或相关文档。

## 安全规则

- 不要把 `SUPABASE_SERVICE_ROLE_KEY` 暴露到前端。
- 不要把 `SUPABASE_SERVICE_ROLE_KEY` 注入 Sandbox。
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` 才是可以暴露给前端的 Supabase key。
- Codex CLI 所需 API key 只能在 Sandbox 执行时注入。
- 不要把用户私密数据直接写入 Sandbox。
- 所有业务表必须包含 `owner_id`。
- 所有业务表必须启用 RLS。
- RLS policies 必须阻止跨用户访问。

## Runner 规则

- 不要把 Sandbox 执行逻辑写成依赖 Vercel Function 本地磁盘的方案。
- Vercel Functions 可以创建和控制 Sandboxes，但长时间生成代码的执行必须发生在 Sandbox 内。
- 所有 Sandbox 操作必须通过服务端封装层完成。
- 不要在页面组件中直接调用 Sandbox SDK。
- Sandbox 任务必须可恢复。
- 必须把 run 状态、sandbox name、当前 step 和 step results 持久化到 Supabase。
- 必须把 stdout/stderr、Agent 状态和构建结果持久化到 `run_events`。
- 如果构建失败，MVP 只能自动修复一次。

## UI 规则

- UI 必须参考 Atoms：
  - 浅色。
  - 极简。
  - 大面积留白。
  - 左侧 Agent Panel。
  - 右侧主画布。
- 项目工作台必须优先支持 Preview、Editor、Plan、Terminal 和 Files。
- MVP 阶段避免加入复杂拖拽编辑器。

## 代码质量规则

- TypeScript 类型要清晰。
- Supabase rows 和 API responses 优先使用显式数据模型。
- Sandbox 编排逻辑必须与 UI components 分离。
- Agent 编排逻辑必须与渲染逻辑分离。
- 重要状态转换前后都要持久化。
- 必须明确处理已停止或已过期 Sandbox。

## 文档规则

- 每次有实质改动后，更新 README 或相关文档。
- 当架构、范围、agents 或路线图变化时，保持 Harness 文件同步更新。
- 不要让安全边界、环境变量或 runner 行为的变化处于未文档化状态。

