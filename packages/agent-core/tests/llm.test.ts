import { describe, expect, it } from "vitest";
import {
  DEEPSEEK_V4_PRO_MODEL,
  DEEPSEEK_OPENAI_BASE_URL,
  buildAgentLlmConfig,
  buildChatCompletionsRequest,
  createOpenAiCompatibleLlmProvider,
  parseOpenAiCompatibleSseLine
} from "../src/llm";

describe("agent LLM configuration", () => {
  it("defaults platform agents to DeepSeek v4 Pro through an OpenAI-compatible endpoint", () => {
    const config = buildAgentLlmConfig({
      OPENAI_API_KEY: "deepseek-key"
    });

    expect(config.provider).toBe("deepseek");
    expect(config.model).toBe(DEEPSEEK_V4_PRO_MODEL);
    expect(config.baseUrl).toBe(DEEPSEEK_OPENAI_BASE_URL);
    expect(config.apiKey).toBe("deepseek-key");
  });

  it("allows explicit environment overrides while preserving DeepSeek defaults", () => {
    const config = buildAgentLlmConfig({
      DEEPSEEK_API_KEY: "provider-key",
      OPENAI_BASE_URL: "https://gateway.example.test/v1",
      OPENAI_MODEL: "deepseek-v4-flash"
    });

    expect(config.apiKey).toBe("provider-key");
    expect(config.baseUrl).toBe("https://gateway.example.test/v1");
    expect(config.model).toBe("deepseek-v4-flash");
  });

  it("builds OpenAI-compatible chat completion requests without LangChain", () => {
    const request = buildChatCompletionsRequest({
      OPENAI_API_KEY: "deepseek-key"
    }, {
      messages: [
        { role: "system", content: "You are ProductAgent." },
        { role: "user", content: "Create a CRM." }
      ],
      responseFormat: "json_object"
    });

    expect(request).toEqual({
      url: `${DEEPSEEK_OPENAI_BASE_URL}/chat/completions`,
      headers: {
        Authorization: "Bearer deepseek-key",
        "Content-Type": "application/json"
      },
      body: {
        model: DEEPSEEK_V4_PRO_MODEL,
        temperature: 0.2,
        stream: false,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: "You are ProductAgent." },
          { role: "user", content: "Create a CRM." }
        ]
      }
    });
  });

  it("parses streamed content and reasoning deltas from DeepSeek-compatible SSE lines", () => {
    expect(parseOpenAiCompatibleSseLine("data: [DONE]")).toEqual({ done: true });
    expect(
      parseOpenAiCompatibleSseLine(
        'data: {"choices":[{"delta":{"reasoning_content":"分析目标用户","content":"{\\"projectName\\""}}]}'
      )
    ).toEqual({
      done: false,
      content: '{"projectName"',
      reasoning: "分析目标用户"
    });
  });

  it("streams sanitized reasoning events before final content", async () => {
    const chunks = [
      'data: {"choices":[{"delta":{"reasoning_content":"需要明确 MVP"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":"{\\"ok\\":true}"}}]}\n\n',
      "data: [DONE]\n\n"
    ];
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        chunks.forEach((chunk) => controller.enqueue(encoder.encode(chunk)));
        controller.close();
      }
    });
    const events: string[] = [];
    const provider = createOpenAiCompatibleLlmProvider({
      env: { OPENAI_API_KEY: "deepseek-key" },
      fetcher: async () =>
        new Response(stream, {
          status: 200,
          headers: { "Content-Type": "text/event-stream" }
        })
    });

    const result = await provider.generateText({
      system: "You are ProductAgent.",
      prompt: "Build a CRM.",
      stream: true,
      onReasoning: (delta) => events.push(delta)
    });

    expect(events).toEqual(["需要明确 MVP"]);
    expect(result.content).toBe('{"ok":true}');
  });
});
