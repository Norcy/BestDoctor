import OpenAI from "openai";

export type AIConfig = {
  provider: string;
  apiKey: string;
  baseURL?: string;
  model: string;
};

export interface AIProvider {
  readonly name: string;
  readonly model: string;
  text(system: string, user: string, maxTokens?: number): Promise<string>;
  json<T>(system: string, user: string, maxTokens?: number): Promise<T>;
}

function readConfig(): AIConfig {
  const provider = process.env.AI_PROVIDER || "openai";
  const apiKey = process.env.AI_API_KEY || process.env.OPENAI_API_KEY || "";
  const model =
    process.env.AI_MODEL ||
    process.env.OPENAI_MODEL ||
    (provider === "openai" ? "gpt-5.6-luna" : "");

  const defaults: Record<string, string | undefined> = {
    openai: undefined,
    deepseek: "https://api.deepseek.com",
    qwen: "https://dashscope.aliyuncs.com/compatible-mode/v1",
  };

  const baseURL = process.env.AI_BASE_URL || defaults[provider];

  if (!apiKey) throw new Error("AI_API_KEY is not configured");
  if (!model) throw new Error("AI_MODEL is not configured");

  return { provider, apiKey, baseURL, model };
}

function extractJson(text: string): string {
  const trimmed = text.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) return trimmed;

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenced) return fenced[1];

  const objectStart = trimmed.indexOf("{");
  const objectEnd = trimmed.lastIndexOf("}");
  if (objectStart >= 0 && objectEnd > objectStart) {
    return trimmed.slice(objectStart, objectEnd + 1);
  }

  throw new Error("AI returned invalid JSON");
}

class OpenAICompatibleProvider implements AIProvider {
  readonly name: string;
  readonly model: string;
  private client: OpenAI;

  constructor(config: AIConfig) {
    this.name = config.provider;
    this.model = config.model;
    this.client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseURL,
    });
  }

  async text(system: string, user: string, maxTokens = 700): Promise<string> {
    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      max_tokens: maxTokens,
      temperature: 0.2,
    });

    return response.choices[0]?.message?.content?.trim() || "";
  }

  async json<T>(system: string, user: string, maxTokens = 400): Promise<T> {
    const response = await this.text(
      system + "\n只输出合法 JSON，不要 Markdown，不要解释。",
      user,
      maxTokens,
    );
    return JSON.parse(extractJson(response)) as T;
  }
}

let cached: { key: string; provider: AIProvider } | null = null;

export function getAIProvider(): AIProvider {
  const config = readConfig();
  const key = JSON.stringify(config);
  if (cached?.key === key) return cached.provider;

  const provider = new OpenAICompatibleProvider(config);
  cached = { key, provider };
  return provider;
}
