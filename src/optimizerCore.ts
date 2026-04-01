import { applyCommonRules, getCommonRules } from "./commonRules";
import { formatPrompt } from "./modelAdapters";
import { normalizeOptimizedPrompt } from "./normalizer";
import { parsePrompt } from "./promptProcessor";
import { OptimizationResult, OptimizationSettings, ParsedPrompt, TargetModel } from "./types";

export async function optimizePromptWithSettings(
  text: string,
  targetModel: TargetModel,
  settings: OptimizationSettings
): Promise<OptimizationResult> {
  if (settings.transformationEngine === "remote") {
    try {
      return await optimizeWithRemoteModel(text, targetModel, settings);
    } catch (error) {
      if (!settings.remote.fallbackToLocal) {
        throw error;
      }
    }
  }

  const parsed = applyCommonRules(parsePrompt(text), settings.commonRules);

  return {
    optimizedPrompt: formatPrompt(parsed, targetModel),
    parsed,
    appliedCommonRules: getCommonRules(settings.commonRules),
    engineUsed: "local",
    normalizedFromRemote: false
  };
}

export function createRemoteHeaders(settings: OptimizationSettings): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json"
  };

  if (settings.remote.provider === "openai-compatible" && settings.remote.apiKey.trim()) {
    headers.Authorization = `Bearer ${settings.remote.apiKey.trim()}`;
  }

  return headers;
}

export function buildRemotePrompt(
  text: string,
  targetModel: TargetModel,
  settings: OptimizationSettings
): string {
  const outputStyle = getOutputStyle(targetModel);
  const languageRule =
    settings.outputLanguage === "english"
      ? "Return English output unless the user explicitly requests another language."
      : "Keep the user's original language when possible.";
  const commonRules = getCommonRules(settings.commonRules);

  return [
    "Convert the user request into a shorter, clearer prompt for an AI coding assistant.",
    "Do not explain your reasoning.",
    "Do not use markdown code fences.",
    "Keep the output flat and concise.",
    languageRule,
    `Target format: ${outputStyle}`,
    "If details are missing, infer the smallest useful output.",
    commonRules.length > 0 ? "Append these general optimization rules when they do not conflict:" : "",
    commonRules.length > 0 ? `- ${commonRules.join("\n- ")}` : "",
    "",
    "User request:",
    text
  ]
    .filter(Boolean)
    .join("\n");
}

async function optimizeWithRemoteModel(
  text: string,
  targetModel: TargetModel,
  settings: OptimizationSettings
): Promise<OptimizationResult> {
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), settings.remote.timeoutMs);

  try {
    const response = await fetch(buildChatCompletionsUrl(settings.remote.baseUrl), {
      method: "POST",
      headers: createRemoteHeaders(settings),
      body: JSON.stringify({
        model: settings.remote.model,
        temperature: settings.remote.temperature,
        messages: [
          {
            role: "system",
            content:
              settings.remote.systemPrompt ||
              "You rewrite prompts into compact, high-signal instructions for coding assistants."
          },
          {
            role: "user",
            content: buildRemotePrompt(text, targetModel, settings)
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

    const normalized = normalizeOptimizedPrompt(text, result, targetModel);
    const parsed = applyCommonRules(parsePrompt(normalized), settings.commonRules);

    return {
      optimizedPrompt: formatPrompt(parsed, targetModel),
      parsed,
      appliedCommonRules: getCommonRules(settings.commonRules),
      engineUsed: "remote",
      normalizedFromRemote: true
    };
  } finally {
    clearTimeout(timeoutHandle);
  }
}

function getOutputStyle(targetModel: TargetModel): string {
  switch (targetModel) {
    case "chatgpt":
      return "Readable semi-structured prompt with short section labels like Input, Constraints, Output.";
    case "cursor":
      return "Minimal developer-friendly bullet list with a concise headline.";
    case "codex":
      return "Strict structure using TASK, INPUT, CONSTRAINTS, OUTPUT blocks.";
    case "claude":
      return "Readable structured prompt using Context, Requirements, Deliverable.";
    case "gemini":
      return "Clear prompt using Goal, Context, Constraints, Expected output.";
    case "deepseek":
      return "Compact engineering style using TASK, KEY INPUT, RULES, RESULT.";
    default:
      return "Strict structure using TASK, INPUT, CONSTRAINTS, OUTPUT blocks.";
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
