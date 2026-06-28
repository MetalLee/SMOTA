# CODEX 任务规则

这些规则适用于本仓库后续所有 SMOTA 开发工作。

## 每次开发前必须阅读

开始修改前，CodingAgent 必须阅读：

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
- OpenCode CLI 所需 API key 只能在 Sandbox 执行时注入。
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
- `tasks` 表是任务分解和任务进度唯一事实来源；`ROADMAP.md` 只作为可读计划说明，OpenCode 不得再维护另一套独立任务清单。
- CodingAgent Prompt 只能包含分配给 CodingAgent 的可回写 task id，并要求 OpenCode 在任务开始、完成或失败时通过 HTTP API 更新这些任务的 `tasks.status`。
- OpenCode 只能使用当前 Run 的短期任务回写 token 更新 `agent_name = CodingAgent` 的任务；这些任务状态更新不能修改 `agent_runs.status`、`current_step` 或 Agent 时间线状态。非 CodingAgent 任务继续按分配的 Agent 状态展示。
- 继续开发 Run 必须优先复用当前项目已有 Sandbox 文件；克隆项目即使没有语义上的 parent run，只要存在克隆写入的 workspace 文件索引，也必须按增量修改处理。
- 复用已有 workspace 时不得重新执行 Vite 初始化，不得覆盖 `/workspace` 中已有应用骨架。
- Sandbox 恢复后若预览端口未监听，服务端必须通过封装层探测并重启 Vite dev server；预览恢复检查必须有并发保护，且每个 preview URL 最多自动触发一次，避免常规轮询持续创建 Sandbox 命令；健康判断必须以 `127.0.0.1:5173` HTTP 可访问为准，不能用 `pgrep` 之类的进程匹配代替；客户端不能直接调用 Sandbox SDK。
- 预览截图属于可选 Review 增强，不得在截图仍运行时提前把 AgentRun 标记为 `succeeded`；截图超时或失败只能记录 review 事件，不能覆盖已成功的 build 状态。
- 如果构建失败，MVP 只能自动修复一次。

## UI 规则

- UI 必须参考 Atoms：
  - 浅色。
  - 极简。
  - 大面积留白。
  - 左侧 Agent Panel。
  - 右侧主画布。
- 项目工作台必须优先支持概览、应用预览器、编辑器、终端和文件；概览 tab 位于应用预览器左侧。
- 左侧计划任务必须按 `ProductAgent`、`ArchitectAgent`、`PlannerAgent`、`CodingAgent`、`BuildAgent`、`ReviewerAgent` 的 Agent 顺序分组展示；同一个 Agent 下的任务保持 PlannerAgent 生成时的原始顺序。
- 文件 tab 必须按目录层级以树状表格展示 `workspace_files`，而不是平铺列表。
- MVP 阶段避免加入复杂拖拽编辑器。
- 所有会触发请求的按钮必须有防重复提交机制：
  - 请求进行中按钮必须禁用。
  - 按钮内必须显示 loading 动画。
  - client-side fetch 按钮必须有同步 guard，防止瞬间多次点击。
  - server action 表单提交按钮优先使用通用 pending button。
- 所有可感知的路由跳转必须有 loading 反馈：
  - 普通页面跳转使用全局毛玻璃蒙版 loading。
  - 工作台内部 tabs 和文件打开只在右侧工作区显示毛玻璃蒙版 loading，不遮挡左侧 Agent Panel。
  - 跳转到当前地址、修饰键打开新页面等行为不应触发蒙版。

## 代码质量规则

- TypeScript 类型要清晰。
- Supabase rows 和 API responses 优先使用显式数据模型。
- ProductAgent、ArchitectAgent、PlannerAgent 和 ReviewerAgent 直接通过轻量 LLMProvider 调用 DeepSeek OpenAI-compatible API，不使用 LangChain。
- 在中文环境下，ProductAgent、ArchitectAgent、PlannerAgent、CodingAgent 和 ReviewerAgent 的用户可见输出必须使用简体中文；技术标识、文件名、命令、代码、API 名称和专有模型名可以保留英文。
- 模型 `reasoning_content` 不写入 `run_events`，也不在 Web 工作台展示；不要把系统提示词或密钥暴露到前端或 Sandbox。
- ProductAgent、ArchitectAgent 和 PlannerAgent 生成的 Harness artifact 入库前必须清理外层 Markdown fence（例如 ` ```markdown ` / ` ``` `），但不能破坏文档内部合法代码块。
- 继续开发 Prompt 必须明确这是已有项目增量修改，包含本次修改提示、已有文件摘要和可用的上一轮 Harness；CodingAgent 不得假设空项目。
- Sandbox 编排逻辑必须与 UI components 分离。
- Agent 编排逻辑必须与渲染逻辑分离。
- 重要状态转换前后都要持久化。
- 必须明确处理已停止或已过期 Sandbox。

## 文档规则

- 每次有实质改动后，更新 README 或相关文档。
- 当架构、范围、agents 或路线图变化时，保持 Harness 文件同步更新。
- 不要让安全边界、环境变量或 runner 行为的变化处于未文档化状态。
