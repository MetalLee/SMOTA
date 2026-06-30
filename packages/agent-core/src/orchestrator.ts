import type { AgentName, GeneratedRunEvent, GeneratedTask, HarnessArtifact, ProjectCreationInput } from "@smota/shared";
import { createOpenAiCompatibleLlmProvider, type LlmProvider } from "./llm";
import { SIMPLIFIED_CHINESE_OUTPUT_INSTRUCTION, withSimplifiedChineseOutputInstruction } from "./output-language";

type AgentStep = "product-brief" | "architecture" | "roadmap";

interface ProductAgentOutput {
  projectName: string;
  projectBrief: string;
  tasks?: GeneratedTask[];
}

interface ArchitectAgentOutput {
  architecture: string;
  codexRules: string;
}

interface PlannerAgentOutput {
  roadmap: string;
  agents: string;
  tasks?: GeneratedTask[];
}

export interface AgentHarnessBundle {
  projectName: string;
  artifacts: HarnessArtifact[];
  tasks: GeneratedTask[];
  events: GeneratedRunEvent[];
}

export interface ContinuationHarnessInput {
  originalPrompt: string;
  changePrompt: string;
  mode: ProjectCreationInput["mode"];
  appType: ProjectCreationInput["appType"];
  sourceKind: "own_previous_run" | "cloned_workspace";
  previousArtifacts: Array<{ path: string; content: string }>;
  workspaceFiles: string[];
}

export interface PlanRevisionHarnessInput {
  originalPrompt: string;
  revisionPrompt: string;
  mode: ProjectCreationInput["mode"];
  appType: ProjectCreationInput["appType"];
  previousArtifacts: Array<{ path: string; content: string }>;
}

export interface AgentOrchestratorCallbacks {
  onEvent?: (event: GeneratedRunEvent) => Promise<void> | void;
  onProjectName?: (projectName: string) => Promise<void> | void;
  onArtifact?: (artifact: HarnessArtifact) => Promise<void> | void;
  onTasks?: (tasks: GeneratedTask[]) => Promise<void> | void;
}

export function parseJsonObjectFromText(text: string): Record<string, unknown> {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  const jsonText = fenced?.[1] ?? trimmed;
  return JSON.parse(jsonText) as Record<string, unknown>;
}

export function stripOuterMarkdownFence(text: string): string {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:markdown|md)?[ \t]*\r?\n([\s\S]*?)\r?\n```[ \t]*$/i);
  return (fenced?.[1] ?? trimmed).trim();
}

function normalizeTask(task: Partial<GeneratedTask>, index: number): GeneratedTask {
  return {
    title: String(task.title ?? `任务 ${index + 1}`),
    description: String(task.description ?? ""),
    status: task.status === "done" || task.status === "in_progress" || task.status === "todo" ? task.status : "todo",
    sortOrder: Number(task.sortOrder ?? index + 1),
    agentName: normalizeTaskAgentName(task.agentName, task.title, task.description)
  };
}

function normalizeTaskBatch(tasks: Partial<GeneratedTask>[], startOrder: number): GeneratedTask[] {
  return tasks
    .filter((task) => !isApprovalPlaceholderTask(task))
    .map((task, index) => ({
      ...normalizeTask(task, index),
      sortOrder: startOrder + index
    }));
}

const AGENT_NAMES: AgentName[] = ["ProductAgent", "ArchitectAgent", "PlannerAgent", "CodingAgent", "BuildAgent", "ReviewerAgent"];

function isAgentName(value: unknown): value is AgentName {
  return typeof value === "string" && AGENT_NAMES.includes(value as AgentName);
}

function normalizeTaskAgentName(agentName: unknown, title: unknown, description: unknown): AgentName {
  if (isAgentName(agentName)) return agentName;

  const text = `${String(title ?? "")} ${String(description ?? "")}`.toLowerCase();
  if (text.includes("build") || text.includes("构建") || text.includes("安装") || text.includes("pnpm")) return "BuildAgent";
  if (text.includes("review") || text.includes("报告") || text.includes("检视") || text.includes("总结")) return "ReviewerAgent";
  if (text.includes("代码") || text.includes("实现") || text.includes("开发") || text.includes("页面") || text.includes("组件")) return "CodingAgent";
  if (text.includes("架构") || text.includes("技术") || text.includes("安全") || text.includes("规范")) return "ArchitectAgent";
  if (text.includes("路线") || text.includes("计划") || text.includes("roadmap") || text.includes("任务")) return "PlannerAgent";
  return "ProductAgent";
}

function isApprovalPlaceholderTask(task: Partial<GeneratedTask>): boolean {
  const text = `${String(task.title ?? "")} ${String(task.description ?? "")}`.toLowerCase();
  return text.includes("等待用户批准") || text.includes("批准计划") || text.includes("用户批准计划") || text.includes("approve plan");
}

function artifact(title: string, path: HarnessArtifact["path"], content: string): HarnessArtifact {
  return {
    type: "harness",
    title,
    path,
    content: stripOuterMarkdownFence(content)
  };
}

function createEvent(agentName: GeneratedRunEvent["agentName"], eventType: GeneratedRunEvent["eventType"], step: AgentStep, message: string): GeneratedRunEvent {
  return {
    agentName,
    eventType,
    step,
    message,
    stream: "system"
  };
}

async function recordEvent(events: GeneratedRunEvent[], callbacks: AgentOrchestratorCallbacks | undefined, event: GeneratedRunEvent) {
  events.push(event);
  await callbacks?.onEvent?.(event);
}

async function generateJson<T>(input: {
  llm: LlmProvider;
  agentName: GeneratedRunEvent["agentName"];
  step: AgentStep;
  system: string;
  prompt: string;
  events: GeneratedRunEvent[];
  callbacks?: AgentOrchestratorCallbacks;
}): Promise<T> {
  await recordEvent(input.events, input.callbacks, createEvent(input.agentName, "agent.started", input.step, `${input.agentName} started.`));
  const result = await input.llm.generateText({
    system: input.system,
    prompt: input.prompt,
    responseFormat: "json_object",
    stream: true
  });
  const parsed = parseJsonObjectFromText(result.content) as T;
  await recordEvent(input.events, input.callbacks, createEvent(input.agentName, "agent.completed", input.step, `${input.agentName} completed.`));
  return parsed;
}

function productPrompt(input: ProjectCreationInput): string {
  return [
    SIMPLIFIED_CHINESE_OUTPUT_INSTRUCTION,
    "",
    "运行环境约束：Sandbox 已在 /workspace 初始化 Vite React TypeScript 应用，/workspace 就是应用根目录。",
    "不得规划或要求创建新的项目根目录，例如 gomoku/、todo-app/、app/ 等。",
    "不得把 index.html、package.json、src/、public/、vite.config.ts 放入某个新子目录；所有应用入口和源码都应位于 /workspace 根及其标准子目录内。",
    "",
    `用户需求：${input.prompt}`,
    `应用类型：${input.appType}`,
    `模式：${input.mode}`,
    "",
    "请输出 JSON：",
    "{",
    '  "projectName": "简洁明确的中文项目名称，12 字以内",',
    '  "projectBrief": "完整 PROJECT_BRIEF.md Markdown，包含产品定位、目标用户、核心场景、MVP 范围、不做事项",',
    '  "tasks": [{"title":"确认产品目标","description":"...","status":"done","sortOrder":1,"agentName":"ProductAgent"}]',
    "}"
  ].join("\n");
}

function architectPrompt(input: ProjectCreationInput, projectBrief: string): string {
  return [
    SIMPLIFIED_CHINESE_OUTPUT_INSTRUCTION,
    "",
    "运行环境约束：Sandbox 已在 /workspace 初始化 Vite React TypeScript 应用，/workspace 就是应用根目录。",
    "架构文档的项目结构必须以 /workspace 根目录为应用根，不要规划或创建 gomoku/、todo-app/、app/ 等新的项目根目录。",
    "不要把 index.html、package.json、src/、public/、vite.config.ts 放入某个新子目录；如需分层，只能在 /workspace/src 下拆分组件、状态和样式模块。",
    "",
    `用户需求：${input.prompt}`,
    "",
    "PROJECT_BRIEF.md:",
    projectBrief,
    "",
    "请输出 JSON：",
    "{",
    '  "architecture": "完整 ARCHITECTURE.md Markdown，包含需求上下文、技术栈、项目结构、模块分工、数据流、安全边界",',
    '  "codexRules": "完整 CODEX_TASK_RULES.md Markdown，包含代码规范、UI 规范、验证规则、安全规则"',
    "}"
  ].join("\n");
}

function plannerPrompt(input: ProjectCreationInput, projectBrief: string, architecture: string): string {
  return [
    SIMPLIFIED_CHINESE_OUTPUT_INSTRUCTION,
    "",
    "运行环境约束：CodingAgent 将在已有 /workspace Vite React TypeScript 根目录执行。",
    "Roadmap、AGENTS 和 tasks 必须要求在 /workspace 根应用内修改文件，不要规划或创建 gomoku/、todo-app/、app/ 等新的项目根目录。",
    "不要把 index.html、package.json、src/、public/、vite.config.ts 放入某个新子目录；任务应指向 /workspace/src 等标准位置。",
    "",
    `用户需求：${input.prompt}`,
    "",
    "PROJECT_BRIEF.md:",
    projectBrief,
    "",
    "ARCHITECTURE.md:",
    architecture,
    "",
    "请输出 JSON：",
    "{",
    '  "roadmap": "完整 ROADMAP.md Markdown，包含开发阶段、任务、验收标准、不做事项",',
    '  "agents": "完整 AGENTS.md Markdown，汇总 ProductAgent、ArchitectAgent、PlannerAgent、CodingAgent、BuildAgent、ReviewerAgent 的职责和流程",',
    "tasks 不要包含“等待用户批准计划”、“批准计划”或任何审批占位任务。",
    "tasks 每一项必须根据标题和描述分配 agentName，只能是 ProductAgent、ArchitectAgent、PlannerAgent、CodingAgent、BuildAgent、ReviewerAgent 之一。",
    "任务状态会在 Web 工作台中跟随 agentName 对应 Agent 的运行状态同步。",
    '  "tasks": [{"title":"实现 MVP 页面","description":"CodingAgent 根据 Harness 文档实现应用","status":"todo","sortOrder":4,"agentName":"CodingAgent"}]',
    "}"
  ].join("\n");
}

function formatPreviousArtifacts(artifacts: Array<{ path: string; content: string }>): string {
  if (!artifacts.length) {
    return "上一轮 Harness 文档不可用，请基于项目说明和文件索引生成增量计划。";
  }

  return artifacts.map((artifact) => `## ${artifact.path}\n\n${artifact.content}`).join("\n\n---\n\n");
}

function continuationContext(input: ContinuationHarnessInput): string {
  const sourceLabel = input.sourceKind === "cloned_workspace" ? "克隆来的已有应用" : "用户自己的上一轮已生成应用";
  return [
    SIMPLIFIED_CHINESE_OUTPUT_INSTRUCTION,
    "",
    `当前场景：${sourceLabel}`,
    "这是对已有 /workspace 应用的继续开发，不要从空项目重新生成，不要完全覆盖既有方向。",
    "当前 /workspace 就是应用根目录；不要规划或创建新的项目根目录，例如 gomoku/、todo-app/、app/ 等。",
    "不要把 index.html、package.json、src/、public/、vite.config.ts 移入某个新子目录；如需新增模块，应放在现有 /workspace/src 下。",
    `原始项目需求：${input.originalPrompt}`,
    `本次用户修改需求：${input.changePrompt}`,
    `应用类型：${input.appType}`,
    `模式：${input.mode}`,
    "",
    "当前 workspace 文件摘要：",
    input.workspaceFiles.length ? input.workspaceFiles.map((path) => `- ${path}`).join("\n") : "- 暂无文件索引",
    "",
    "上一轮 Harness 文档：",
    formatPreviousArtifacts(input.previousArtifacts)
  ].join("\n");
}

function continuationProductPrompt(input: ContinuationHarnessInput): string {
  return [
    continuationContext(input),
    "",
    "请输出 JSON：",
    "{",
    '  "projectName": "保留或微调后的中文项目名称，12 字以内",',
    '  "projectBrief": "完整 PROJECT_BRIEF.md Markdown，重点描述本次修改目标、保留的既有产品定位、受影响场景、增量 MVP 范围和不做事项",',
    '  "tasks": [{"title":"确认本次修改目标","description":"...","status":"done","sortOrder":1,"agentName":"ProductAgent"}]',
    "}"
  ].join("\n");
}

function continuationArchitectPrompt(input: ContinuationHarnessInput, projectBrief: string): string {
  return [
    continuationContext(input),
    "",
    "本轮 PROJECT_BRIEF.md:",
    projectBrief,
    "",
    "请输出 JSON：",
    "{",
    '  "architecture": "完整 ARCHITECTURE.md Markdown，描述已有架构判断、受影响模块、增量数据流、安全边界和 Sandbox 复用策略",',
    '  "codexRules": "完整 CODEX_TASK_RULES.md Markdown，强调基于现有文件增量修改、保持风格连续、不要重建项目" ',
    "}"
  ].join("\n");
}

function continuationPlannerPrompt(input: ContinuationHarnessInput, projectBrief: string, architecture: string): string {
  return [
    continuationContext(input),
    "",
    "本轮 PROJECT_BRIEF.md:",
    projectBrief,
    "",
    "本轮 ARCHITECTURE.md:",
    architecture,
    "",
    "请输出 JSON：",
    "{",
    '  "roadmap": "完整 ROADMAP.md Markdown，包含本次增量开发阶段、任务、验收标准、不做事项",',
    '  "agents": "完整 AGENTS.md Markdown，说明所有 Agent 按已有 workspace 增量开发流程执行",',
    "tasks 不要包含“等待用户批准计划”、“批准计划”或任何审批占位任务。",
    "tasks 每一项必须根据标题和描述分配 agentName，只能是 ProductAgent、ArchitectAgent、PlannerAgent、CodingAgent、BuildAgent、ReviewerAgent 之一。",
    "任务状态会在 Web 工作台中跟随 agentName 对应 Agent 的运行状态同步。",
    '  "tasks": [{"title":"实现本次修改","description":"CodingAgent 在已有 /workspace 中增量修改","status":"todo","sortOrder":4,"agentName":"CodingAgent"}]',
    "}"
  ].join("\n");
}

function planRevisionContext(input: PlanRevisionHarnessInput): string {
  return [
    SIMPLIFIED_CHINESE_OUTPUT_INSTRUCTION,
    "",
    "当前场景：用户尚未批准计划，正在要求修改已生成的 Harness 文档和计划任务。",
    "请基于已有 Harness 文档和用户本次修改意见重新修改 Harness，不要从零开始，也不要忽略旧文档中仍然有效的产品、架构和约束。",
    `原始项目需求：${input.originalPrompt}`,
    `用户本次修改意见：${input.revisionPrompt}`,
    `应用类型：${input.appType}`,
    `模式：${input.mode}`,
    "",
    "已有 Harness 文档：",
    formatPreviousArtifacts(input.previousArtifacts)
  ].join("\n");
}

function planRevisionProductPrompt(input: PlanRevisionHarnessInput): string {
  return [
    planRevisionContext(input),
    "",
    "请输出 JSON：",
    "{",
    '  "projectName": "保留或微调后的中文项目名称，12 字以内",',
    '  "projectBrief": "完整 PROJECT_BRIEF.md Markdown，基于旧 Harness 和本次修改意见重写产品定位、目标用户、核心场景、MVP 范围和不做事项",',
    '  "tasks": [{"title":"确认计划修改目标","description":"...","status":"done","sortOrder":1,"agentName":"ProductAgent"}]',
    "}"
  ].join("\n");
}

function planRevisionArchitectPrompt(input: PlanRevisionHarnessInput, projectBrief: string): string {
  return [
    planRevisionContext(input),
    "",
    "本轮 PROJECT_BRIEF.md:",
    projectBrief,
    "",
    "请输出 JSON：",
    "{",
    '  "architecture": "完整 ARCHITECTURE.md Markdown，基于旧 Harness 和新需求重新说明技术架构、模块边界、数据流、部署模型、安全边界和 Sandbox 策略",',
    '  "codexRules": "完整 CODEX_TASK_RULES.md Markdown，基于本轮计划重新生成代码规范、安全规则和 UI 指南"',
    "}"
  ].join("\n");
}

function planRevisionPlannerPrompt(input: PlanRevisionHarnessInput, projectBrief: string, architecture: string): string {
  return [
    planRevisionContext(input),
    "",
    "本轮 PROJECT_BRIEF.md:",
    projectBrief,
    "",
    "本轮 ARCHITECTURE.md:",
    architecture,
    "",
    "请输出 JSON：",
    "{",
    '  "roadmap": "完整 ROADMAP.md Markdown，基于已修改的产品和架构重新生成阶段、任务、验收标准和不做事项",',
    '  "agents": "完整 AGENTS.md Markdown，重新说明 ProductAgent、ArchitectAgent、PlannerAgent、CodingAgent、BuildAgent、ReviewerAgent 的职责和流程",',
    "tasks 不要包含“等待用户批准计划”、“批准计划”或任何审批占位任务。",
    "tasks 每一项必须根据标题和描述分配 agentName，只能是 ProductAgent、ArchitectAgent、PlannerAgent、CodingAgent、BuildAgent、ReviewerAgent 之一。",
    '  "tasks": [{"title":"实现修订后的 MVP","description":"CodingAgent 根据更新后的 Harness 实现应用","status":"todo","sortOrder":4,"agentName":"CodingAgent"}]',
    "}"
  ].join("\n");
}

export function createAgentOrchestrator(options: { llm?: LlmProvider } = {}) {
  const llm = options.llm ?? createOpenAiCompatibleLlmProvider();

  return {
    async generateHarnessBundle(input: ProjectCreationInput, callbacks?: AgentOrchestratorCallbacks): Promise<AgentHarnessBundle> {
      const events: GeneratedRunEvent[] = [];
      const artifacts: HarnessArtifact[] = [];
      const tasks: GeneratedTask[] = [];

      const product = await generateJson<ProductAgentOutput>({
        llm,
        agentName: "ProductAgent",
        step: "product-brief",
        system: withSimplifiedChineseOutputInstruction("你是 SMOTA 的 ProductAgent。只输出 JSON，不要输出解释。"),
        prompt: productPrompt(input),
        events,
        callbacks
      });
      await callbacks?.onProjectName?.(product.projectName);
      const productArtifact = artifact("Project Brief", "PROJECT_BRIEF.md", product.projectBrief);
      artifacts.push(productArtifact);
      await callbacks?.onArtifact?.(productArtifact);
      const productTasks = normalizeTaskBatch(product.tasks ?? [], 1);
      tasks.push(...productTasks);
      if (productTasks.length) {
        await callbacks?.onTasks?.(productTasks);
      }

      const architect = await generateJson<ArchitectAgentOutput>({
        llm,
        agentName: "ArchitectAgent",
        step: "architecture",
        system: withSimplifiedChineseOutputInstruction("你是 SMOTA 的 ArchitectAgent。只输出 JSON，不要输出解释。"),
        prompt: architectPrompt(input, product.projectBrief),
        events,
        callbacks
      });
      const architectureArtifact = artifact("Architecture", "ARCHITECTURE.md", architect.architecture);
      const rulesArtifact = artifact("Codex Task Rules", "CODEX_TASK_RULES.md", architect.codexRules);
      artifacts.push(architectureArtifact, rulesArtifact);
      await callbacks?.onArtifact?.(architectureArtifact);
      await callbacks?.onArtifact?.(rulesArtifact);

      const planner = await generateJson<PlannerAgentOutput>({
        llm,
        agentName: "PlannerAgent",
        step: "roadmap",
        system: withSimplifiedChineseOutputInstruction("你是 SMOTA 的 PlannerAgent。只输出 JSON，不要输出解释。"),
        prompt: plannerPrompt(input, product.projectBrief, architect.architecture),
        events,
        callbacks
      });
      const roadmapArtifact = artifact("Roadmap", "ROADMAP.md", planner.roadmap);
      const agentsArtifact = artifact("Agents", "AGENTS.md", planner.agents);
      artifacts.push(roadmapArtifact, agentsArtifact);
      await callbacks?.onArtifact?.(roadmapArtifact);
      await callbacks?.onArtifact?.(agentsArtifact);
      const plannerTasks = normalizeTaskBatch(planner.tasks ?? [], tasks.length + 1);
      tasks.push(...plannerTasks);
      if (plannerTasks.length) {
        await callbacks?.onTasks?.(plannerTasks);
      }

      return {
        projectName: product.projectName,
        artifacts,
        tasks,
        events
      };
    },

    async generateContinuationHarnessBundle(input: ContinuationHarnessInput, callbacks?: AgentOrchestratorCallbacks): Promise<AgentHarnessBundle> {
      const events: GeneratedRunEvent[] = [];
      const artifacts: HarnessArtifact[] = [];
      const tasks: GeneratedTask[] = [];

      const product = await generateJson<ProductAgentOutput>({
        llm,
        agentName: "ProductAgent",
        step: "product-brief",
        system: withSimplifiedChineseOutputInstruction("你是 SMOTA 的 ProductAgent。只输出 JSON，不要输出解释。"),
        prompt: continuationProductPrompt(input),
        events,
        callbacks
      });
      await callbacks?.onProjectName?.(product.projectName);
      const productArtifact = artifact("Project Brief", "PROJECT_BRIEF.md", product.projectBrief);
      artifacts.push(productArtifact);
      await callbacks?.onArtifact?.(productArtifact);
      const productTasks = normalizeTaskBatch(product.tasks ?? [], 1);
      tasks.push(...productTasks);
      if (productTasks.length) {
        await callbacks?.onTasks?.(productTasks);
      }

      const architect = await generateJson<ArchitectAgentOutput>({
        llm,
        agentName: "ArchitectAgent",
        step: "architecture",
        system: withSimplifiedChineseOutputInstruction("你是 SMOTA 的 ArchitectAgent。只输出 JSON，不要输出解释。"),
        prompt: continuationArchitectPrompt(input, product.projectBrief),
        events,
        callbacks
      });
      const architectureArtifact = artifact("Architecture", "ARCHITECTURE.md", architect.architecture);
      const rulesArtifact = artifact("Codex Task Rules", "CODEX_TASK_RULES.md", architect.codexRules);
      artifacts.push(architectureArtifact, rulesArtifact);
      await callbacks?.onArtifact?.(architectureArtifact);
      await callbacks?.onArtifact?.(rulesArtifact);

      const planner = await generateJson<PlannerAgentOutput>({
        llm,
        agentName: "PlannerAgent",
        step: "roadmap",
        system: withSimplifiedChineseOutputInstruction("你是 SMOTA 的 PlannerAgent。只输出 JSON，不要输出解释。"),
        prompt: continuationPlannerPrompt(input, product.projectBrief, architect.architecture),
        events,
        callbacks
      });
      const roadmapArtifact = artifact("Roadmap", "ROADMAP.md", planner.roadmap);
      const agentsArtifact = artifact("Agents", "AGENTS.md", planner.agents);
      artifacts.push(roadmapArtifact, agentsArtifact);
      await callbacks?.onArtifact?.(roadmapArtifact);
      await callbacks?.onArtifact?.(agentsArtifact);
      const plannerTasks = normalizeTaskBatch(planner.tasks ?? [], tasks.length + 1);
      tasks.push(...plannerTasks);
      if (plannerTasks.length) {
        await callbacks?.onTasks?.(plannerTasks);
      }

      return {
        projectName: product.projectName,
        artifacts,
        tasks,
        events
      };
    },

    async generatePlanRevisionHarnessBundle(input: PlanRevisionHarnessInput, callbacks?: AgentOrchestratorCallbacks): Promise<AgentHarnessBundle> {
      const events: GeneratedRunEvent[] = [];
      const artifacts: HarnessArtifact[] = [];
      const tasks: GeneratedTask[] = [];

      const product = await generateJson<ProductAgentOutput>({
        llm,
        agentName: "ProductAgent",
        step: "product-brief",
        system: withSimplifiedChineseOutputInstruction("你是 SMOTA 的 ProductAgent。只输出 JSON，不要输出解释。"),
        prompt: planRevisionProductPrompt(input),
        events,
        callbacks
      });
      await callbacks?.onProjectName?.(product.projectName);
      const productArtifact = artifact("Project Brief", "PROJECT_BRIEF.md", product.projectBrief);
      artifacts.push(productArtifact);
      await callbacks?.onArtifact?.(productArtifact);
      const productTasks = normalizeTaskBatch(product.tasks ?? [], 1);
      tasks.push(...productTasks);
      if (productTasks.length) {
        await callbacks?.onTasks?.(productTasks);
      }

      const architect = await generateJson<ArchitectAgentOutput>({
        llm,
        agentName: "ArchitectAgent",
        step: "architecture",
        system: withSimplifiedChineseOutputInstruction("你是 SMOTA 的 ArchitectAgent。只输出 JSON，不要输出解释。"),
        prompt: planRevisionArchitectPrompt(input, product.projectBrief),
        events,
        callbacks
      });
      const architectureArtifact = artifact("Architecture", "ARCHITECTURE.md", architect.architecture);
      const rulesArtifact = artifact("Codex Task Rules", "CODEX_TASK_RULES.md", architect.codexRules);
      artifacts.push(architectureArtifact, rulesArtifact);
      await callbacks?.onArtifact?.(architectureArtifact);
      await callbacks?.onArtifact?.(rulesArtifact);

      const planner = await generateJson<PlannerAgentOutput>({
        llm,
        agentName: "PlannerAgent",
        step: "roadmap",
        system: withSimplifiedChineseOutputInstruction("你是 SMOTA 的 PlannerAgent。只输出 JSON，不要输出解释。"),
        prompt: planRevisionPlannerPrompt(input, product.projectBrief, architect.architecture),
        events,
        callbacks
      });
      const roadmapArtifact = artifact("Roadmap", "ROADMAP.md", planner.roadmap);
      const agentsArtifact = artifact("Agents", "AGENTS.md", planner.agents);
      artifacts.push(roadmapArtifact, agentsArtifact);
      await callbacks?.onArtifact?.(roadmapArtifact);
      await callbacks?.onArtifact?.(agentsArtifact);
      const plannerTasks = normalizeTaskBatch(planner.tasks ?? [], tasks.length + 1);
      tasks.push(...plannerTasks);
      if (plannerTasks.length) {
        await callbacks?.onTasks?.(plannerTasks);
      }

      return {
        projectName: product.projectName,
        artifacts,
        tasks,
        events
      };
    }
  };
}
