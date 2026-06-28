import type { GeneratedRunEvent, GeneratedTask, HarnessArtifact, ProjectCreationInput } from "@smota/shared";
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
    sortOrder: Number(task.sortOrder ?? index + 1)
  };
}

function normalizeTaskBatch(tasks: Partial<GeneratedTask>[], startOrder: number): GeneratedTask[] {
  return tasks.map((task, index) => ({
    ...normalizeTask(task, index),
    sortOrder: startOrder + index
  }));
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
  await recordEvent(input.events, input.callbacks, createEvent(input.agentName, "agent.completed", input.step, `${input.agentName} completed.`));
  return parseJsonObjectFromText(result.content) as T;
}

function productPrompt(input: ProjectCreationInput): string {
  return [
    SIMPLIFIED_CHINESE_OUTPUT_INSTRUCTION,
    "",
    `用户需求：${input.prompt}`,
    `应用类型：${input.appType}`,
    `模式：${input.mode}`,
    "",
    "请输出 JSON：",
    "{",
    '  "projectName": "简洁明确的中文项目名称，12 字以内",',
    '  "projectBrief": "完整 PROJECT_BRIEF.md Markdown，包含产品定位、目标用户、核心场景、MVP 范围、不做事项",',
    '  "tasks": [{"title":"确认产品目标","description":"...","status":"done","sortOrder":1}]',
    "}"
  ].join("\n");
}

function architectPrompt(input: ProjectCreationInput, projectBrief: string): string {
  return [
    SIMPLIFIED_CHINESE_OUTPUT_INSTRUCTION,
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
    '  "tasks": [{"title":"等待用户批准计划","description":"...","status":"todo","sortOrder":4}]',
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
    }
  };
}
