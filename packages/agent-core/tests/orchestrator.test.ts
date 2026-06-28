import { describe, expect, it } from "vitest";
import { createAgentOrchestrator, parseJsonObjectFromText } from "../src/orchestrator";
import type { LlmProvider } from "../src/llm";

function createScriptedProvider(responses: string[], reasoningScripts: string[][] = []): LlmProvider {
  let index = 0;
  return {
    async generateText(input) {
      const reasoningDeltas = reasoningScripts[index] ?? [`reasoning-${index + 1}`];
      reasoningDeltas.forEach((delta) => input.onReasoning?.(delta));
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

  it("removes outer markdown fences from generated harness artifact content", async () => {
    const provider = createScriptedProvider([
      JSON.stringify({
        projectName: "Portfolio",
        projectBrief: "```markdown\n# PROJECT_BRIEF.md\n\nBrief body\n```",
        tasks: []
      }),
      JSON.stringify({
        architecture: "```md\n# ARCHITECTURE.md\n\nArchitecture body\n```",
        codexRules: "```\n# CODEX_TASK_RULES.md\n\nRules body\n```"
      }),
      JSON.stringify({
        roadmap: "```Markdown\n# ROADMAP.md\n\nRoadmap body\n```",
        agents: "# AGENTS\n\nAgent body",
        tasks: []
      })
    ]);

    const bundle = await createAgentOrchestrator({ llm: provider }).generateHarnessBundle({
      prompt: "Create a designer portfolio landing page",
      mode: "plan-first",
      appType: "Landing Page"
    });

    expect(bundle.artifacts.find((artifact) => artifact.path === "PROJECT_BRIEF.md")?.content).toBe("# PROJECT_BRIEF.md\n\nBrief body");
    expect(bundle.artifacts.find((artifact) => artifact.path === "ARCHITECTURE.md")?.content).toBe("# ARCHITECTURE.md\n\nArchitecture body");
    expect(bundle.artifacts.find((artifact) => artifact.path === "CODEX_TASK_RULES.md")?.content).toBe("# CODEX_TASK_RULES.md\n\nRules body");
    expect(bundle.artifacts.find((artifact) => artifact.path === "ROADMAP.md")?.content).toBe("# ROADMAP.md\n\nRoadmap body");
    expect(bundle.artifacts.every((artifact) => !artifact.content.startsWith("```"))).toBe(true);
    expect(bundle.artifacts.every((artifact) => !artifact.content.endsWith("```"))).toBe(true);
  });

  it("runs Product, Architect, and Planner without persisted reasoning events", async () => {
    const systems: string[] = [];
    const prompts: string[] = [];
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
    const originalGenerateText = provider.generateText;
    provider.generateText = async (input) => {
      systems.push(input.system);
      prompts.push(input.prompt);
      return originalGenerateText(input);
    };

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
    expect(bundle.events.map((event) => event.eventType)).not.toContain("agent.reasoning");
    expect(bundle.events.map((event) => event.agentName)).toEqual([
      "ProductAgent",
      "ProductAgent",
      "ArchitectAgent",
      "ArchitectAgent",
      "PlannerAgent",
      "PlannerAgent"
    ]);
    expect(bundle.events.map((event) => `${event.agentName}:${event.eventType}`)).toEqual([
      "ProductAgent:agent.started",
      "ProductAgent:agent.completed",
      "ArchitectAgent:agent.started",
      "ArchitectAgent:agent.completed",
      "PlannerAgent:agent.started",
      "PlannerAgent:agent.completed"
    ]);
    expect(systems.every((system) => system.includes("简体中文"))).toBe(true);
    expect(prompts.every((prompt) => prompt.includes("简体中文"))).toBe(true);
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

  it("generates continuation harness artifacts from an existing cloned workspace", async () => {
    const prompts: string[] = [];
    const provider = createScriptedProvider([
      JSON.stringify({
        projectName: "克隆看板改造",
        projectBrief: "# 项目简介\n\n## 本次修改目标\n给克隆来的看板增加筛选器",
        tasks: [{ title: "确认本次修改目标", description: "基于已有文件增量修改", status: "done" }]
      }),
      JSON.stringify({
        architecture: "# 架构\n\n## 增量影响\n复用现有 React 结构",
        codexRules: "# CODEX 任务规则\n\n## 修改规则\n不要重建项目"
      }),
      JSON.stringify({
        roadmap: "# 路线图\n\n## 本次迭代\n增加筛选器",
        agents: "# AGENTS\n\n## CodingAgent\n基于当前 /workspace 修改",
        tasks: [{ title: "实现筛选器", description: "保持现有风格", status: "todo" }]
      })
    ]);
    const originalGenerateText = provider.generateText;
    provider.generateText = async (input) => {
      prompts.push(input.prompt);
      return originalGenerateText(input);
    };

    const bundle = await createAgentOrchestrator({ llm: provider }).generateContinuationHarnessBundle({
      originalPrompt: "克隆来的销售看板",
      changePrompt: "增加按负责人筛选",
      mode: "plan-first",
      appType: "Admin",
      sourceKind: "cloned_workspace",
      previousArtifacts: [{ path: "PROJECT_BRIEF.md", content: "# 旧项目简介\n销售看板" }],
      workspaceFiles: ["package.json", "src/App.tsx"]
    });

    expect(bundle.artifacts.map((artifact) => artifact.path)).toEqual([
      "PROJECT_BRIEF.md",
      "ARCHITECTURE.md",
      "CODEX_TASK_RULES.md",
      "ROADMAP.md",
      "AGENTS.md"
    ]);
    expect(bundle.tasks.map((task) => task.title)).toEqual(["确认本次修改目标", "实现筛选器"]);
    expect(prompts.join("\n")).toContain("增加按负责人筛选");
    expect(prompts.join("\n")).toContain("克隆来的已有应用");
    expect(prompts.join("\n")).toContain("不要从空项目重新生成");
    expect(prompts.join("\n")).toContain("src/App.tsx");
  });

  it("reindexes generated tasks in agent execution order when model sort orders are noisy", async () => {
    const provider = createScriptedProvider([
      JSON.stringify({
        projectName: "Portfolio",
        projectBrief: "# Project Brief\nDesigner portfolio",
        tasks: [
          { title: "确认产品目标", description: "目标", status: "done", sortOrder: 20 },
          { title: "梳理核心功能", description: "功能", status: "done", sortOrder: 3 }
        ]
      }),
      JSON.stringify({
        architecture: "# Architecture\nReact",
        codexRules: "# Rules\nClean UI"
      }),
      JSON.stringify({
        roadmap: "# Roadmap\nPhase 1",
        agents: "# AGENTS\nPlannerAgent",
        tasks: [
          { title: "等待用户批准计划", description: "批准", status: "todo", sortOrder: 1 },
          { title: "开发环境搭建", description: "环境", status: "todo", sortOrder: 1 }
        ]
      })
    ]);

    const bundle = await createAgentOrchestrator({ llm: provider }).generateHarnessBundle({
      prompt: "Create a designer portfolio landing page",
      mode: "plan-first",
      appType: "Landing Page"
    });

    expect(bundle.tasks.map((task) => `${task.sortOrder}:${task.title}`)).toEqual([
      "1:确认产品目标",
      "2:梳理核心功能",
      "3:等待用户批准计划",
      "4:开发环境搭建"
    ]);
  });
});
