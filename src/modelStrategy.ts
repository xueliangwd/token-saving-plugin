import { ModelStrategy, ParsedPrompt, TargetModel } from "./types";

const MODEL_STRATEGIES: Record<TargetModel, ModelStrategy> = {
  chatgpt: {
    remoteGuidance: [
      "Keep the tone readable and lightly descriptive.",
      "Favor short natural language sections over rigid spec wording."
    ],
    maxInput: 6,
    maxConstraints: 5,
    maxOutput: 3
  },
  cursor: {
    remoteGuidance: [
      "Optimize for terse developer-facing bullets.",
      "Minimize prose and keep the headline compact."
    ],
    maxInput: 5,
    maxConstraints: 3,
    maxOutput: 2
  },
  codex: {
    remoteGuidance: [
      "Optimize for strict spec-like structure.",
      "Keep wording task-driven and implementation-ready."
    ],
    maxInput: 6,
    maxConstraints: 5,
    maxOutput: 3
  },
  claude: {
    remoteGuidance: [
      "Keep the structure readable with clear context and deliverables.",
      "Preserve nuance without adding unnecessary verbosity."
    ],
    maxInput: 6,
    maxConstraints: 4,
    maxOutput: 3
  },
  gemini: {
    remoteGuidance: [
      "Emphasize goal, context, constraints, and expected output.",
      "Keep the output concise but explicit."
    ],
    maxInput: 5,
    maxConstraints: 4,
    maxOutput: 3
  },
  deepseek: {
    remoteGuidance: [
      "Use compact engineering-style phrasing.",
      "Prioritize key inputs, rules, and concrete results."
    ],
    maxInput: 5,
    maxConstraints: 4,
    maxOutput: 2
  }
};

export function getModelStrategy(targetModel: TargetModel): ModelStrategy {
  return MODEL_STRATEGIES[targetModel];
}

export function applyModelStrategy(parsed: ParsedPrompt, targetModel: TargetModel): ParsedPrompt {
  const strategy = getModelStrategy(targetModel);

  return {
    task: parsed.task,
    input: sanitizeItems(parsed.input).slice(0, strategy.maxInput),
    constraints: sanitizeItems(parsed.constraints).slice(0, strategy.maxConstraints),
    output: sanitizeOutputs(parsed.output).slice(0, strategy.maxOutput)
  };
}

function sanitizeItems(values: string[]): string[] {
  return values
    .map((item) => item.trim())
    .filter(Boolean);
}

function sanitizeOutputs(values: string[]): string[] {
  const sanitized = sanitizeItems(values);
  if (sanitized.length <= 1) {
    return sanitized;
  }

  return sanitized.filter((item) => item.toLowerCase() !== "implementation");
}
