# AGENTS

## 平台内部 Agent

### ProductAgent

根据用户的一句话需求生成项目简介和产品需求。它负责定义目标用户、核心场景、MVP 范围和不做事项。

ProductAgent 接入真实 LLM。它默认使用 DeepSeek OpenAI-compatible API，从用户输入中提炼简洁明确的项目名称并写入数据库 `projects.name`，然后生成 `PROJECT_BRIEF.md`。执行过程中的 reasoning 不写入 `run_events`。
在中文环境下，ProductAgent 的项目名称、正文、任务标题和说明必须使用简体中文；技术标识、文件名、命令和 API 名称可以保留英文。

### ArchitectAgent

生成技术架构。它负责定义系统模块、数据流、部署模型、安全边界、数据库设计和 Sandbox 执行策略。

ArchitectAgent 接入真实 LLM。它根据用户输入和 `PROJECT_BRIEF.md` 生成 `ARCHITECTURE.md`，并将代码规范、安全规则和符合项目风格的 UI 规范写入 `CODEX_TASK_RULES.md`。
在中文环境下，ArchitectAgent 输出的架构说明、规范和 UI 指南必须使用简体中文；技术栈、包名、命令和文件名可以保留英文。

### PlannerAgent

生成 Roadmap 和任务计划。它将工作拆分为阶段，并为每个阶段定义目标、任务、验收标准和明确的不做事项。

PlannerAgent 接入真实 LLM。它根据用户输入、`PROJECT_BRIEF.md` 和 `ARCHITECTURE.md` 生成 `ROADMAP.md`，并在核心 Harness 文档完成后汇总生成 `AGENTS.md`。
在中文环境下，PlannerAgent 输出的路线图、任务、验收标准和 Agent 流程必须使用简体中文。

### CodingAgent

通过 Vercel Sandbox 调用 OpenCode CLI 执行代码修改。它在 `/workspace` 内工作，并使用 Harness 文件作为本地项目上下文。

CodingAgent 保持当前功能，不直接接入平台 LLMProvider。它在 Sandbox 内通过 OpenCode CLI 接收 `PROJECT_BRIEF.md`、`ARCHITECTURE.md` 和 `CODEX_TASK_RULES.md` 作为必要上下文，并只接收数据库 `tasks` 表中分配给 CodingAgent 的任务 ID 作为唯一任务清单执行代码修改；`ROADMAP.md` 和 `AGENTS.md` 仍写入 Sandbox 供人工查看，但不传入 CodingAgent Prompt，避免重复计划和职责说明干扰代码执行。CodingAgent 不得在 OpenCode 内重新拆分一套独立进度任务。在中文环境下，生成应用的用户可见文案、注释说明和报告性内容优先使用简体中文；代码标识符和技术 API 可保留英文。

CodingAgent 每开始某个 CodingAgent 任务前，必须通过平台提供的 HTTP API 将该任务状态改为 `in_progress`；任务完成后改为 `done`；无法完成时改为 `failed` 并说明原因。CodingAgent 任务状态只更新 `tasks.status`，不绑定也不修改 `agent_runs.status`；非 CodingAgent 任务继续按分配的 Agent 状态展示。

### BuildAgent

在 Vercel Sandbox 内执行安装、构建和检查。它记录 stdout/stderr、构建状态和错误。如果构建失败，MVP 阶段只协调一次自动修复。

BuildAgent 不直接接入 LLMProvider。构建失败时，它调用 Sandbox 内的 OpenCode CLI 分析并执行一次自动修复。
BuildAgent 完成构建后，平台服务端必须将当前 Run 下所有 `agent_name = BuildAgent` 的任务兜底更新为 `done`，避免构建已完成但计划任务仍停留在未完成状态。

### ReviewerAgent

总结生成的变更、构建结果、已知问题和下一步建议。它为用户生成最终 Review Report。

ReviewerAgent 接入真实 LLM。它读取 build result、run events、文件索引和已知问题，生成中文 `REVIEW_REPORT.md`；如果 LLM 不可用，则生成确定性中文 fallback 报告。

## 开发流程

1. 用户输入一句话需求。
2. 平台创建 Project，项目名先使用用户输入前十个字加 `...` 作为占位。
3. 平台创建 AgentRun，并立即跳转到项目详情页。
4. 项目详情页自动启动规划流程。
5. ProductAgent、ArchitectAgent 和 PlannerAgent 逐步生成项目内 Harness 文档，概览 tab 根据已写入 artifacts 实时变化：
   - `PROJECT_BRIEF.md`
   - `ARCHITECTURE.md`
   - `ROADMAP.md`
   - `CODEX_TASK_RULES.md`
   - `AGENTS.md`
   - 写入 artifacts 前必须移除 LLM 返回内容最外层的 Markdown fence，避免把 ` ```markdown ` 当作文档正文展示。
6. ProductAgent 确定正式项目名称后回写数据库。
7. 用户批准生成的计划。
8. 项目详情页自动调用 `/sandbox/start` 入队 Vercel Sandbox workflow，不需要用户再次点击启动按钮；该接口返回 `202 Accepted` 后，后续进度由 Supabase 状态和事件刷新。
9. 后台 worker 根据 `sandbox_workflow_jobs` 的 job lease 执行或恢复 Sandbox workflow。
10. 平台将 Harness 文件写入 Sandbox `/workspace`。
11. 平台在 Sandbox 内初始化 Vite React TypeScript 应用。
12. CodingAgent 在 Sandbox 内执行 OpenCode CLI。
13. CodingAgent 按 `tasks` 表中分配给 CodingAgent 的任务 ID 执行，并通过 HTTP 请求回写这些任务状态。
14. BuildAgent 在 Sandbox 内执行 `pnpm install`。
15. BuildAgent 在 Sandbox 内执行 `pnpm build`。
16. 如果构建失败，BuildAgent 触发一次自动修复。
17. BuildAgent 构建成功后，平台将当前 Run 下分配给 BuildAgent 的任务更新为 `done`。
18. 平台扫描 Sandbox 文件树，并将文件索引写入 Supabase。
19. 平台启动 dev server，并生成 preview URL。
   - 如果持久化 Sandbox 后续被访问并恢复，但 `5173` 端口没有监听，项目详情页预览 tab 会在每个 preview URL 上最多自动触发一次服务端恢复检查，手动刷新可强制重试；服务端会在单个 Sandbox 命令内重启 Vite dev server 并等待端口就绪。
20. ReviewerAgent 生成中文质量检视报告。
21. Web 工作台展示概览、应用预览器、编辑器、终端和文件；左侧计划任务按 ProductAgent、ArchitectAgent、PlannerAgent、CodingAgent、BuildAgent、ReviewerAgent 顺序分组展示，同一 Agent 下保持原任务顺序；文件 tab 按目录层级以树状表格展示。

## 继续开发流程

1. 当当前 Run 处于已完成或已失败状态时，项目详情页左侧输入框启用。
2. 用户输入新的修改提示后，平台创建同一项目下的新 AgentRun。
3. 普通续跑记录 `parent_run_id`；克隆项目即使没有语义父 Run，也会从当前项目最近可用的 Sandbox 和 `workspace_files` 解析已有 workspace。
4. ProductAgent、ArchitectAgent 和 PlannerAgent 基于原始需求、本次修改提示、已有 Harness 和当前文件索引生成增量计划。
5. 用户批准计划后，Runner 复用已有持久化 Vercel Sandbox 和 `/workspace`，不重新初始化 Vite，不覆盖现有应用骨架。
6. CodingAgent 在已有文件基础上执行 OpenCode CLI 增量修改。
7. BuildAgent 执行安装、构建和一次自动修复。
8. ReviewerAgent 生成本次继续开发的中文质量检视报告。

## Agent 状态持久化

每个 Agent 都必须将关键状态转换持久化到 Supabase：

- Agent 开始。
- Agent 完成。
- 当前 step。
- 适用时记录 stdout/stderr。
- 错误。
- 构建状态。
- 修复尝试状态。
- Preview URL。
- 质量检视报告完成状态。

只要可行，Agent 执行必须能够从已持久化的 AgentRun 和 Sandbox metadata 恢复。
