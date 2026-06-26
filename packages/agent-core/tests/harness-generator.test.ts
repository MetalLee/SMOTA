import { describe, expect, it } from "vitest";
import { generateHarnessBundle } from "../src/harness-generator";

describe("generateHarnessBundle", () => {
  it("creates five prompt-aware harness artifacts", () => {
    const bundle = generateHarnessBundle({
      prompt: "为宠物诊所创建预约管理后台",
      mode: "plan-first",
      appType: "Admin"
    });

    expect(bundle.artifacts.map((artifact) => artifact.path)).toEqual([
      "PROJECT_BRIEF.md",
      "ARCHITECTURE.md",
      "ROADMAP.md",
      "CODEX_TASK_RULES.md",
      "AGENTS.md"
    ]);
    expect(bundle.artifacts).toHaveLength(5);
    expect(bundle.artifacts.every((artifact) => artifact.content.includes("宠物诊所"))).toBe(true);
    expect(bundle.tasks.length).toBeGreaterThanOrEqual(4);
    expect(bundle.events.map((event) => event.agentName)).toEqual([
      "ProductAgent",
      "ArchitectAgent",
      "PlannerAgent"
    ]);
  });
});
