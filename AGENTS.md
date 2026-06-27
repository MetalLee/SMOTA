# AGENTS

## 平台内部 Agent

### ProductAgent

根据用户的一句话需求生成项目简介和产品需求。它负责定义目标用户、核心场景、MVP 范围和不做事项。

ProductAgent 接入真实 LLM。它默认使用 DeepSeek OpenAI-compatible API，从用户输入中提炼简洁明确的项目名称并写入数据库 `projects.name`，然后生成 `PROJECT_BRIEF.md`。执行过程中的 reasoning 摘要写入 `run_events`，事件类型为 `agent.reasoning`。

### ArchitectAgent

生成技术架构。它负责定义系统模块、数据流、部署模型、安全边界、数据库设计和 Sandbox 执行策略。

ArchitectAgent 接入真实 LLM。它根据用户输入和 `PROJECT_BRIEF.md` 生成 `ARCHITECTURE.md`，并将代码规范、安全规则和符合项目风格的 UI 规范写入 `CODEX_TASK_RULES.md`。

### PlannerAgent

生成 Roadmap 和任务计划。它将工作拆分为阶段，并为每个阶段定义目标、任务、验收标准和明确的不做事项。

PlannerAgent 接入真实 LLM。它根据用户输入、`PROJECT_BRIEF.md` 和 `ARCHITECTURE.md` 生成 `ROADMAP.md`，并在核心 Harness 文档完成后汇总生成 `AGENTS.md`。

### CodingAgent

通过 Vercel Sandbox 调用 OpenCode CLI 执行代码修改。它在 `/workspace` 内工作，并使用 Harness 文件作为本地项目上下文。

CodingAgent 保持当前功能，不直接接入平台 LLMProvider。它在 Sandbox 内通过 OpenCode CLI 阅读 `AGENTS.md`、`PROJECT_BRIEF.md`、`ARCHITECTURE.md`、`CODEX_TASK_RULES.md` 和 `ROADMAP.md`，按照计划编写代码。

### BuildAgent

在 Vercel Sandbox 内执行安装、构建和检查。它记录 stdout/stderr、构建状态和错误。如果构建失败，MVP 阶段只协调一次自动修复。

BuildAgent 不直接接入 LLMProvider。构建失败时，它调用 Sandbox 内的 OpenCode CLI 分析并执行一次自动修复。

### ReviewerAgent

总结生成的变更、构建结果、已知问题和下一步建议。它为用户生成最终 Review Report。

ReviewerAgent 接入真实 LLM。它读取 build result、run events、文件索引和已知问题，生成 `REVIEW_REPORT.md`；如果 LLM 不可用，则生成确定性 fallback 报告。

## 开发流程

1. 用户输入一句话需求。
2. 平台创建 Project。
3. 平台创建 AgentRun。
4. ProductAgent、ArchitectAgent 和 PlannerAgent 生成项目内 Harness 文档：
   - `PROJECT_BRIEF.md`
   - `ARCHITECTURE.md`
   - `ROADMAP.md`
   - `CODEX_TASK_RULES.md`
   - `AGENTS.md`
5. 用户批准生成的计划。
6. 平台创建 Vercel Sandbox。
7. 平台将 Harness 文件写入 Sandbox `/workspace`。
8. 平台在 Sandbox 内初始化 Vite React TypeScript 应用。
9. CodingAgent 在 Sandbox 内执行 OpenCode CLI。
10. BuildAgent 在 Sandbox 内执行 `pnpm install`。
11. BuildAgent 在 Sandbox 内执行 `pnpm build`。
12. 如果构建失败，BuildAgent 触发一次自动修复。
13. 平台扫描 Sandbox 文件树，并将文件索引写入 Supabase。
14. 平台启动 dev server，并生成 preview URL。
15. ReviewerAgent 生成 Review Report。
16. Web 工作台展示 Preview、Editor、Terminal、Plan 和 Files。

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
- Review Report 完成状态。

只要可行，Agent 执行必须能够从已持久化的 AgentRun 和 Sandbox metadata 恢复。

