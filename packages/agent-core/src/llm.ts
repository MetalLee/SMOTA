export const DEEPSEEK_OPENAI_BASE_URL = "https://api.deepseek.com";
export const DEEPSEEK_V4_PRO_MODEL = "deepseek-v4-pro";

export type ChatRole = "system" | "user" | "assistant";

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export interface AgentLlmConfig {
  provider: "deepseek";
  apiKey: string;
  baseUrl: string;
  model: string;
  temperature: number;
}

export interface GenerateTextInput {
  system: string;
  prompt: string;
  model?: string;
  temperature?: number;
  responseFormat?: "json_object" | "text";
  stream?: boolean;
  onReasoning?: (delta: string) => void;
  onContent?: (delta: string) => void;
}

export interface GenerateTextResult {
  content: string;
}

export interface LlmProvider {
  generateText(input: GenerateTextInput): Promise<GenerateTextResult>;
}

type Fetcher = typeof fetch;

export function buildAgentLlmConfig(env: Record<string, string | undefined> = process.env): AgentLlmConfig {
  return {
    provider: "deepseek",
    apiKey: env.OPENAI_API_KEY ?? env.DEEPSEEK_API_KEY ?? "",
    baseUrl: env.OPENAI_BASE_URL || DEEPSEEK_OPENAI_BASE_URL,
    model: env.OPENAI_MODEL || DEEPSEEK_V4_PRO_MODEL,
    temperature: Number(env.OPENAI_TEMPERATURE ?? 0.2)
  };
}

export function buildChatCompletionsRequest(
  env: Record<string, string | undefined> = process.env,
  input: {
    messages: ChatMessage[];
    model?: string;
    temperature?: number;
    responseFormat?: "json_object" | "text";
    stream?: boolean;
  }
) {
  const config = buildAgentLlmConfig(env);
  return {
    url: `${config.baseUrl.replace(/\/$/, "")}/chat/completions`,
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json"
    },
    body: {
      model: input.model ?? config.model,
      temperature: input.temperature ?? config.temperature,
      stream: input.stream ?? false,
      ...(input.responseFormat === "json_object" ? { response_format: { type: "json_object" } } : {}),
      messages: input.messages
    }
  };
}

export function parseOpenAiCompatibleSseLine(line: string): { done: true } | { done: false; content?: string; reasoning?: string } | null {
  if (!line.startsWith("data:")) {
    return null;
  }

  const data = line.slice("data:".length).trim();
  if (!data) {
    return null;
  }
  if (data === "[DONE]") {
    return { done: true };
  }

  const parsed = JSON.parse(data) as {
    choices?: Array<{
      delta?: {
        content?: string;
        reasoning_content?: string;
      };
    }>;
  };
  const delta = parsed.choices?.[0]?.delta;
  return {
    done: false,
    content: delta?.content,
    reasoning: delta?.reasoning_content
  };
}

async function readStreamedChatResponse(response: Response, input: GenerateTextInput): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) {
    return "";
  }

  const decoder = new TextDecoder();
  let buffer = "";
  let content = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const event = parseOpenAiCompatibleSseLine(line.trim());
      if (!event) {
        continue;
      }
      if (event.done) {
        return content;
      }
      if (event.reasoning) {
        input.onReasoning?.(event.reasoning);
      }
      if (event.content) {
        content += event.content;
        input.onContent?.(event.content);
      }
    }
  }

  return content;
}

async function readJsonChatResponse(response: Response): Promise<string> {
  const json = (await response.json()) as {
    choices?: Array<{
      message?: {
        content?: string;
        reasoning_content?: string;
      };
    }>;
  };

  return json.choices?.[0]?.message?.content ?? "";
}

export function createOpenAiCompatibleLlmProvider(options: {
  env?: Record<string, string | undefined>;
  fetcher?: Fetcher;
} = {}): LlmProvider {
  const env = options.env ?? process.env;
  const fetcher = options.fetcher ?? fetch;

  return {
    async generateText(input) {
      const config = buildAgentLlmConfig(env);
      if (!config.apiKey) {
        throw new Error("Missing OPENAI_API_KEY or DEEPSEEK_API_KEY for platform agents.");
      }

      const request = buildChatCompletionsRequest(env, {
        messages: [
          { role: "system", content: input.system },
          { role: "user", content: input.prompt }
        ],
        model: input.model,
        temperature: input.temperature,
        responseFormat: input.responseFormat,
        stream: input.stream
      });

      const response = await fetcher(request.url, {
        method: "POST",
        headers: request.headers,
        body: JSON.stringify(request.body)
      });

      if (!response.ok) {
        const body = await response.text();
        throw new Error(`LLM request failed with ${response.status}: ${body}`);
      }

      const content = input.stream ? await readStreamedChatResponse(response, input) : await readJsonChatResponse(response);
      return { content };
    }
  };
}
