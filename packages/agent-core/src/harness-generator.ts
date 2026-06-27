import { deriveProjectName, type GeneratedRunEvent, type GeneratedTask, type HarnessBundle, type ProjectCreationInput } from "@smota/shared";
import { createAgents, createArchitecture, createCodexRules, createProjectBrief, createRoadmap } from "./mock-agents";

export function generateHarnessBundle(input: ProjectCreationInput): HarnessBundle {
  const projectName = deriveProjectName(input.prompt);
  const artifacts = [
    createProjectBrief(input),
    createArchitecture(input),
    createRoadmap(input),
    createCodexRules(input),
    createAgents(input)
  ];

  const tasks: GeneratedTask[] = [
    {
      title: "确认产品目标",
      description: `围绕“${input.prompt}”明确目标用户、MVP 范围和不做事项。`,
      status: "done",
      sortOrder: 1
    },
    {
      title: "确认技术架构",
      description: "约束为 Vercel Sandbox Runner，避免 Local Runner 和 Fastify API。",
      status: "done",
      sortOrder: 2
    },
    {
      title: "生成 Roadmap",
      description: "拆分计划、验收标准和后续构建阶段。",
      status: "done",
      sortOrder: 3
    },
    {
      title: "等待用户批准计划",
      description: "批准后才允许进入 Vercel Sandbox 构建阶段。",
      status: "todo",
      sortOrder: 4
    }
  ];

  const events: GeneratedRunEvent[] = [
    {
      agentName: "ProductAgent",
      eventType: "agent.completed",
      step: "product-brief",
      message: `ProductAgent 已为「${projectName}」生成项目简介。`,
      stream: "system"
    },
    {
      agentName: "ArchitectAgent",
      eventType: "agent.completed",
      step: "architecture",
      message: "ArchitectAgent 已生成技术架构和安全边界。",
      stream: "system"
    },
    {
      agentName: "PlannerAgent",
      eventType: "agent.completed",
      step: "roadmap",
      message: "PlannerAgent 已生成 Roadmap、任务和验收标准。",
      stream: "system"
    }
  ];

  return { projectName, artifacts, tasks, events };
}
