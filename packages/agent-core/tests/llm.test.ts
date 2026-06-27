import { describe, expect, it } from "vitest";
import {
  DEEPSEEK_V4_PRO_MODEL,
  DEEPSEEK_OPENAI_BASE_URL,
  buildAgentLlmConfig,
  buildLangChainChatOpenAIOptions
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

  it("returns LangChain ChatOpenAI options for future agents", () => {
    const options = buildLangChainChatOpenAIOptions({
      OPENAI_API_KEY: "deepseek-key"
    });

    expect(options).toEqual({
      apiKey: "deepseek-key",
      model: DEEPSEEK_V4_PRO_MODEL,
      temperature: 0.2,
      configuration: {
        baseURL: DEEPSEEK_OPENAI_BASE_URL
      }
    });
  });
});
