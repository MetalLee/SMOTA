import { describe, expect, it } from "vitest";
import { createReviewerAgent } from "../src/reviewer-agent";
import type { LlmProvider } from "../src/llm";

describe("ReviewerAgent", () => {
  it("generates a review report from build result, run events, files, and known issues", async () => {
    const llm: LlmProvider = {
      async generateText(input) {
        input.onReasoning?.("梳理构建结果和文件变化");
        expect(input.prompt).toContain("pnpm build succeeded");
        expect(input.prompt).toContain("src/App.tsx");
        return {
          content: JSON.stringify({
            report: "# Review Report\n\n## Summary\n构建成功，核心页面已生成。\n\n## Known Issues\n- 暂无阻断问题。\n"
          })
        };
      }
    };

    const agent = createReviewerAgent({ llm });
    const events: string[] = [];
    const result = await agent.generateReport({
      buildResult: "pnpm build succeeded",
      runEvents: [{ eventType: "build.succeeded", message: "pnpm build succeeded." }],
      files: [{ path: "src/App.tsx", changeType: "created" }],
      knownIssues: [],
      previewUrl: "https://preview.example.dev",
      onReasoning: (delta) => events.push(delta)
    });

    expect(events).toEqual(["梳理构建结果和文件变化"]);
    expect(result).toContain("# Review Report");
    expect(result).toContain("构建成功");
  });
});
