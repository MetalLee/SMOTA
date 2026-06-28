import { createOpenAiCompatibleLlmProvider, type LlmProvider } from "./llm";
import { SIMPLIFIED_CHINESE_OUTPUT_INSTRUCTION, withSimplifiedChineseOutputInstruction } from "./output-language";
import { parseJsonObjectFromText } from "./orchestrator";

export interface ReviewRunEventInput {
  eventType: string;
  message: string | null;
}

export interface ReviewFileInput {
  path: string;
  changeType?: string | null;
}

export function createReviewerAgent(options: { llm?: LlmProvider } = {}) {
  const llm = options.llm ?? createOpenAiCompatibleLlmProvider();

  return {
    async generateReport(input: {
      buildResult: string;
      runEvents: ReviewRunEventInput[];
      files: ReviewFileInput[];
      knownIssues: string[];
      previewUrl?: string | null;
      onReasoning?: (delta: string) => void;
    }): Promise<string> {
      const prompt = [
        SIMPLIFIED_CHINESE_OUTPUT_INSTRUCTION,
        "",
        "请根据以下信息生成 REVIEW_REPORT.md。",
        "",
        `Build result:\n${input.buildResult}`,
        "",
        `Preview URL: ${input.previewUrl ?? "N/A"}`,
        "",
        "Run events:",
        input.runEvents.map((event) => `- ${event.eventType}: ${event.message ?? ""}`).join("\n"),
        "",
        "Files:",
        input.files.map((file) => `- ${file.path}${file.changeType ? ` (${file.changeType})` : ""}`).join("\n"),
        "",
        "Known issues:",
        input.knownIssues.length > 0 ? input.knownIssues.map((issue) => `- ${issue}`).join("\n") : "- 暂无已知问题",
        "",
        '只输出 JSON：{"report":"# 质量检视报告\\n..."}'
      ].join("\n");

      const result = await llm.generateText({
        system: withSimplifiedChineseOutputInstruction("你是 SMOTA 的 ReviewerAgent。输出面向用户的简洁质量检视报告。只输出 JSON。"),
        prompt,
        responseFormat: "json_object",
        stream: true,
        onReasoning: input.onReasoning
      });
      const parsed = parseJsonObjectFromText(result.content) as { report?: string };
      return parsed.report?.trim() || fallbackReviewReport(input.buildResult, input.previewUrl);
    }
  };
}

export function fallbackReviewReport(buildResult: string, previewUrl?: string | null): string {
  return `# 质量检视报告

## 构建结果

${buildResult}

${previewUrl ? `预览地址：${previewUrl}` : "预览地址：暂无"}

## 已知问题

- ReviewerAgent 暂时无法调用真实 LLM，因此 SMOTA 生成了这份确定性 fallback 报告。
`;
}
