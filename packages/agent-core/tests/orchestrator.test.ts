import { describe, expect, it } from "vitest";
import { createAgentOrchestrator, parseJsonObjectFromText } from "../src/orchestrator";
import type { LlmProvider } from "../src/llm";

function createScriptedProvider(responses: string[]): LlmProvider {
  let index = 0;
  return {
    async generateText(input) {
      input.onReasoning?.(`reasoning-${index + 1}`);
      const content = responses[index];
      index += 1;
      if (!content) {
        throw new Error("Missing scripted LLM response.");
      }
      return { content };
    }
  };
}

describe("agent orchestrator", () => {
  it("extracts JSON objects from model text wrapped in markdown fences", () => {
    expect(parseJsonObjectFromText('```json\n{"name":"CRM"}\n```')).toEqual({ name: "CRM" });
  });

  it("runs Product, Architect, and Planner with persisted reasoning events", async () => {
    const provider = createScriptedProvider([
      JSON.stringify({
        projectName: "宠物诊所预约台",
        projectBrief: "# 项目简介\n\n## 产品定位\n宠物诊所预约管理后台",
        tasks: [{ title: "确认产品目标", description: "定义目标用户", status: "done" }]
      }),
      JSON.stringify({
        architecture: "# 架构\n\n## 技术栈\nVite React TypeScript",
        codexRules: "# CODEX 任务规则\n\n## UI 规范\n浅色、克制、易扫描"
      }),
      JSON.stringify({
        roadmap: "# 路线图\n\n## Phase 1\n完成主路径",
        agents: "# AGENTS\n\n## ProductAgent\n产品经理\n\n## ReviewerAgent\n质量检视",
        tasks: [{ title: "等待用户批准计划", description: "批准后进入 Sandbox", status: "todo" }]
      })
    ]);

    const orchestrator = createAgentOrchestrator({ llm: provider });
    const bundle = await orchestrator.generateHarnessBundle({
      prompt: "为宠物诊所创建预约管理后台",
      mode: "plan-first",
      appType: "Admin"
    });

    expect(bundle.projectName).toBe("宠物诊所预约台");
    expect(bundle.artifacts.map((artifact) => artifact.path)).toEqual([
      "PROJECT_BRIEF.md",
      "ARCHITECTURE.md",
      "CODEX_TASK_RULES.md",
      "ROADMAP.md",
      "AGENTS.md"
    ]);
    expect(bundle.artifacts.find((artifact) => artifact.path === "PROJECT_BRIEF.md")?.content).toContain("宠物诊所预约管理后台");
    expect(bundle.tasks.map((task) => task.title)).toEqual(["确认产品目标", "等待用户批准计划"]);
    expect(bundle.events.map((event) => event.eventType)).toContain("agent.reasoning");
    expect(bundle.events.map((event) => event.agentName)).toEqual([
      "ProductAgent",
      "ProductAgent",
      "ProductAgent",
      "ArchitectAgent",
      "ArchitectAgent",
      "ArchitectAgent",
      "PlannerAgent",
      "PlannerAgent",
      "PlannerAgent"
    ]);
    expect(bundle.events.map((event) => `${event.agentName}:${event.eventType}`)).toEqual([
      "ProductAgent:agent.started",
      "ProductAgent:agent.reasoning",
      "ProductAgent:agent.completed",
      "ArchitectAgent:agent.started",
      "ArchitectAgent:agent.reasoning",
      "ArchitectAgent:agent.completed",
      "PlannerAgent:agent.started",
      "PlannerAgent:agent.reasoning",
      "PlannerAgent:agent.completed"
    ]);
  });

  it("emits artifacts and project name as each planning agent completes", async () => {
    const provider = createScriptedProvider([
      JSON.stringify({
        projectName: "宠物诊所预约台",
        projectBrief: "# 项目简介\n宠物诊所",
        tasks: []
      }),
      JSON.stringify({
        architecture: "# 架构\nReact",
        codexRules: "# CODEX 任务规则\n浅色 UI"
      }),
      JSON.stringify({
        roadmap: "# 路线图\nPhase 1",
        agents: "# AGENTS\nPlannerAgent",
        tasks: []
      })
    ]);
    const emitted: string[] = [];

    await createAgentOrchestrator({ llm: provider }).generateHarnessBundle(
      {
        prompt: "为宠物诊所创建预约管理后台",
        mode: "plan-first",
        appType: "Admin"
      },
      {
        onProjectName: async (projectName) => {
          emitted.push(`name:${projectName}`);
        },
        onArtifact: async (artifact) => {
          emitted.push(`artifact:${artifact.path}`);
        }
      }
    );

    expect(emitted).toEqual([
      "name:宠物诊所预约台",
      "artifact:PROJECT_BRIEF.md",
      "artifact:ARCHITECTURE.md",
      "artifact:CODEX_TASK_RULES.md",
      "artifact:ROADMAP.md",
      "artifact:AGENTS.md"
    ]);
  });
});
