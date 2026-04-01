import { buildRemoteHeaders, buildRemotePrompt, getPromptOptimizerConfig } from "./config";
import { formatPrompt } from "./modelAdapters";
import { normalizeOptimizedPrompt } from "./normalizer";
import { parsePrompt } from "./promptProcessor";
import { TargetModel } from "./types";

export async function optimizePrompt(text: string, targetModel: TargetModel): Promise<string> {
  const config = getPromptOptimizerConfig();

  if (config.transformationEngine === "remote") {
    try {
      return await optimizeWithRemoteModel(text, targetModel);
    } catch (error) {
      if (!config.fallbackToLocal) {
        throw error;
      }
    }
  }

  return formatPrompt(parsePrompt(text), targetModel);
}

async function optimizeWithRemoteModel(text: string, targetModel: TargetModel): Promise<string> {
  const config = getPromptOptimizerConfig();
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), config.remoteTimeoutMs);

  try {
    const response = await fetch(buildChatCompletionsUrl(config.remoteBaseUrl), {
      method: "POST",
      headers: buildRemoteHeaders(config),
      body: JSON.stringify({
        model: config.remoteModel,
        temperature: config.remoteTemperature,
        messages: [
          {
            role: "system",
            content:
              config.remoteSystemPrompt ||
              "You rewrite prompts into compact, high-signal instructions for coding assistants."
          },
          {
            role: "user",
            content: buildRemotePrompt(text, targetModel, config.outputLanguage)
          }
        ]
      }),
      signal: controller.signal
    });

    if (!response.ok) {
      const body = await safeReadResponse(response);
      throw new Error(`Remote model request failed with ${response.status}: ${body}`);
    }

    const payload = (await response.json()) as ChatCompletionsResponse;
    const result = payload.choices?.[0]?.message?.content?.trim();

    if (!result) {
      throw new Error("Remote model returned an empty response.");
    }

    return normalizeOptimizedPrompt(text, result, targetModel);
  } finally {
    clearTimeout(timeoutHandle);
  }
}

function buildChatCompletionsUrl(baseUrl: string): string {
  const trimmed = baseUrl.replace(/\/+$/g, "");
  return trimmed.endsWith("/chat/completions") ? trimmed : `${trimmed}/chat/completions`;
}

async function safeReadResponse(response: Response): Promise<string> {
  try {
    return (await response.text()).slice(0, 400);
  } catch {
    return "Unable to read error response.";
  }
}

interface ChatCompletionsResponse {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
}
