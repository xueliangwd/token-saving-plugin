import { CommonRulesConfig, ParsedPrompt } from "./types";

export const BUILT_IN_COMMON_RULES = [
  "keep the prompt compact and remove filler",
  "preserve concrete entities, APIs, field names, and domain terms",
  "prefer explicit tasks, constraints, and deliverables",
  "do not invent missing business requirements",
  "keep the structure flat and easy to paste into another AI tool"
];

export function getCommonRules(config: CommonRulesConfig): string[] {
  if (!config.enabled) {
    return [];
  }

  return dedupeItems([
    ...(config.appendBuiltIn ? BUILT_IN_COMMON_RULES : []),
    ...config.customRules.map((item) => item.trim()).filter(Boolean)
  ]);
}

export function applyCommonRules(parsed: ParsedPrompt, config: CommonRulesConfig): ParsedPrompt {
  const commonRules = getCommonRules(config);
  if (commonRules.length === 0) {
    return parsed;
  }

  return {
    ...parsed,
    constraints: dedupeItems([...parsed.constraints, ...commonRules])
  };
}

function dedupeItems(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const normalized = value.trim();
    if (!normalized) {
      continue;
    }

    const key = normalized.toLowerCase();
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(normalized);
  }

  return result;
}
