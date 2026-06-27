import { ChatOpenAI } from "@langchain/openai";

export const DEEPSEEK_OPENAI_BASE_URL = "https://api.deepseek.com";
export const DEEPSEEK_V4_PRO_MODEL = "deepseek-v4-pro";

export interface AgentLlmConfig {
  provider: "deepseek";
  apiKey: string;
  baseUrl: string;
  model: string;
  temperature: number;
}

export interface LangChainChatOpenAIOptions {
  apiKey: string;
  model: string;
  temperature: number;
  configuration: {
    baseURL: string;
  };
}

export function buildAgentLlmConfig(env: Record<string, string | undefined> = process.env): AgentLlmConfig {
  return {
    provider: "deepseek",
    apiKey: env.OPENAI_API_KEY ?? env.DEEPSEEK_API_KEY ?? "",
    baseUrl: env.OPENAI_BASE_URL || DEEPSEEK_OPENAI_BASE_URL,
    model: env.OPENAI_MODEL || DEEPSEEK_V4_PRO_MODEL,
    temperature: Number(env.OPENAI_TEMPERATURE ?? 0.2)
  };
}

export function buildLangChainChatOpenAIOptions(env: Record<string, string | undefined> = process.env): LangChainChatOpenAIOptions {
  const config = buildAgentLlmConfig(env);
  return {
    apiKey: config.apiKey,
    model: config.model,
    temperature: config.temperature,
    configuration: {
      baseURL: config.baseUrl
    }
  };
}

export function createAgentChatModel(env: Record<string, string | undefined> = process.env): ChatOpenAI {
  return new ChatOpenAI(buildLangChainChatOpenAIOptions(env));
}
