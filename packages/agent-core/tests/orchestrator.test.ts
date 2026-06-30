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
    expect(bundle.tasks.map((task) => task.title)).toEqual(["确认产品目标"]);
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

  it("instructs planning agents to keep the generated app at the /workspace Vite root", async () => {
    const prompts: string[] = [];
    const provider = createScriptedProvider([
      JSON.stringify({
        projectName: "简易五子棋",
        projectBrief: "# 项目简介\n五子棋",
        tasks: []
      }),
      JSON.stringify({
        architecture: "# 架构\nVite React TypeScript",
        codexRules: "# CODEX 任务规则\n根目录开发"
      }),
      JSON.stringify({
        roadmap: "# 路线图\n实现棋盘",
        agents: "# AGENTS\nCodingAgent",
        tasks: []
      })
    ]);
    const originalGenerateText = provider.generateText;
    provider.generateText = async (input) => {
      prompts.push(input.prompt);
      return originalGenerateText(input);
    };

    await createAgentOrchestrator({ llm: provider }).generateHarnessBundle({
      prompt: "做一个简易五子棋游戏",
      mode: "plan-first",
      appType: "Web App"
    });

    const allPrompts = prompts.join("\n");
    expect(allPrompts).toContain("/workspace");
    expect(allPrompts).toContain("Vite React TypeScript");
    expect(allPrompts).toContain("不要规划或创建 gomoku/");
    expect(allPrompts).toContain("不要把 index.html、package.json、src/");
  });

  it("does not mark an agent completed when its JSON response cannot be parsed", async () => {
    const provider = createScriptedProvider([
      JSON.stringify({
        projectName: "五子棋",
        projectBrief: "# 项目简介\n五子棋",
        tasks: []
      }),
      JSON.stringify({
        architecture: "# 架构\nVite",
        codexRules: "# CODEX 任务规则\n根目录"
      }),
      '{"roadmap":"# 路线图\n非法 JSON 控制字符","agents":"# AGENTS","tasks":[]}'
    ]);
    const events: string[] = [];

    await expect(
      createAgentOrchestrator({ llm: provider }).generateHarnessBundle(
        {
          prompt: "做一个五子棋",
          mode: "plan-first",
          appType: "Web App"
        },
        {
          onEvent: (event) => {
            events.push(`${event.agentName}:${event.eventType}:${event.step}`);
          }
        }
      )
    ).rejects.toThrow(/control character|JSON/i);

    expect(events).toContain("PlannerAgent:agent.started:roadmap");
    expect(events).not.toContain("PlannerAgent:agent.completed:roadmap");
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

  it("generates plan revision harness artifacts from existing harness documents", async () => {
    const prompts: string[] = [];
    const provider = createScriptedProvider([
      JSON.stringify({
        projectName: "像素游戏宣发页",
        projectBrief: "# PROJECT_BRIEF.md\n\n保留像素游戏定位，加入亮色模式调整。",
        tasks: [{ title: "确认计划修改目标", description: "基于已有 Harness 修订", status: "done", agentName: "ProductAgent" }]
      }),
      JSON.stringify({
        architecture: "# ARCHITECTURE.md\n\n沿用 React 架构，调整主题变量。",
        codexRules: "# CODEX_TASK_RULES.md\n\n保持现有文件结构。"
      }),
      JSON.stringify({
        roadmap: "# ROADMAP.md\n\n调整亮色主题并验收。",
        agents: "# AGENTS.md\n\nPlannerAgent 重新生成任务。",
        tasks: [{ title: "实现亮色主题", description: "修改样式变量", status: "todo", agentName: "CodingAgent" }]
      })
    ]);
    const originalGenerateText = provider.generateText;
    provider.generateText = async (input) => {
      prompts.push(input.prompt);
      return originalGenerateText(input);
    };

    const bundle = await createAgentOrchestrator({ llm: provider }).generatePlanRevisionHarnessBundle({
      originalPrompt: "制作像素 Roguelike 游戏宣发页",
      revisionPrompt: "将整体视觉改成亮色模式",
      mode: "plan-first",
      appType: "Landing Page",
      previousArtifacts: [
        { path: "PROJECT_BRIEF.md", content: "# 旧项目简介\n深色像素风" },
        { path: "ARCHITECTURE.md", content: "# 旧架构\nReact + Tailwind" }
      ]
    });

    expect(bundle.artifacts.map((artifact) => artifact.path)).toEqual([
      "PROJECT_BRIEF.md",
      "ARCHITECTURE.md",
      "CODEX_TASK_RULES.md",
      "ROADMAP.md",
      "AGENTS.md"
    ]);
    expect(bundle.tasks.map((task) => task.title)).toEqual(["确认计划修改目标", "实现亮色主题"]);
    expect(prompts.join("\n")).toContain("将整体视觉改成亮色模式");
    expect(prompts.join("\n")).toContain("# 旧项目简介");
    expect(prompts.join("\n")).toContain("重新修改 Harness");
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
      "3:开发环境搭建"
    ]);
  });

  it("normalizes task agent assignments and omits approval placeholder tasks", async () => {
    const provider = createScriptedProvider([
      JSON.stringify({
        projectName: "Portfolio",
        projectBrief: "# Project Brief\nDesigner portfolio",
        tasks: [{ title: "确认产品目标", description: "目标", status: "done", sortOrder: 1, agentName: "ProductAgent" }]
      }),
      JSON.stringify({
        architecture: "# Architecture\nReact",
        codexRules: "# Rules\nClean UI"
      }),
      JSON.stringify({
        roadmap: "# Roadmap\nPhase 1",
        agents: "# AGENTS\nPlannerAgent",
        tasks: [
          { title: "等待用户批准计划", description: "批准后启动", status: "todo", sortOrder: 2, agentName: "PlannerAgent" },
          { title: "实现页面", description: "编码应用", status: "todo", sortOrder: 3, agentName: "CodingAgent" },
          { title: "运行构建", description: "pnpm build", status: "todo", sortOrder: 4, agentName: "BuildAgent" },
          { title: "输出质量报告", description: "总结结果", status: "todo", sortOrder: 5, agentName: "ReviewerAgent" }
        ]
      })
    ]);

    const bundle = await createAgentOrchestrator({ llm: provider }).generateHarnessBundle({
      prompt: "Create a designer portfolio landing page",
      mode: "plan-first",
      appType: "Landing Page"
    });

    expect(bundle.tasks.map((task) => task.title)).toEqual(["确认产品目标", "实现页面", "运行构建", "输出质量报告"]);
    expect(bundle.tasks.map((task) => task.agentName)).toEqual(["ProductAgent", "CodingAgent", "BuildAgent", "ReviewerAgent"]);
  });
});
