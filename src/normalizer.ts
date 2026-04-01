import { formatPrompt } from "./modelAdapters";
import { parsePrompt } from "./promptProcessor";
import { ParsedPrompt, TargetModel } from "./types";

export function normalizeOptimizedPrompt(originalText: string, candidateText: string, targetModel: TargetModel): string {
  const merged = mergeParsedPrompts(parsePrompt(originalText), parsePrompt(candidateText));
  return formatPrompt(merged, targetModel);
}

function mergeParsedPrompts(base: ParsedPrompt, incoming: ParsedPrompt): ParsedPrompt {
  return {
    task: pickPreferred(base.task, incoming.task),
    input: dedupe([...base.input, ...incoming.input]).slice(0, 10),
    constraints: dedupe([...base.constraints, ...incoming.constraints]).slice(0, 10),
    output: dedupe([...base.output, ...incoming.output]).slice(0, 8)
  };
}

function pickPreferred(base: string, incoming: string): string {
  if (!incoming || incoming === "handle the request") {
    return base;
  }

  return incoming.length >= base.length ? incoming : base;
}

function dedupe(items: string[]): string[] {
  return Array.from(new Set(items.map((item) => item.trim()).filter(Boolean)));
}
