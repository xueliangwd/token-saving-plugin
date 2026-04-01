import { ParsedPrompt, TargetModel } from "./types";

export function formatPrompt(data: ParsedPrompt, model: TargetModel): string {
  switch (model) {
    case "chatgpt":
      return formatChatGPT(data);
    case "cursor":
      return formatCursor(data);
    case "codex":
      return formatCodex(data);
    case "claude":
      return formatClaude(data);
    case "gemini":
      return formatGemini(data);
    case "deepseek":
      return formatDeepSeek(data);
    default:
      return formatCodex(data);
  }
}

function formatChatGPT(data: ParsedPrompt): string {
  const lines: string[] = [];
  lines.push(toSentence(data.task));

  if (data.input.length > 0) {
    lines.push(`Input:\n- ${data.input.join("\n- ")}`);
  }

  if (data.constraints.length > 0) {
    lines.push(`Constraints:\n- ${data.constraints.join("\n- ")}`);
  }

  if (data.output.length > 0) {
    lines.push(`Output:\n- ${data.output.join("\n- ")}`);
  }

  return lines.join("\n\n");
}

function formatCursor(data: ParsedPrompt): string {
  const lines: string[] = [toCursorHeadline(data.task)];

  for (const item of data.input) {
    lines.push(`- ${item}`);
  }

  for (const item of data.constraints) {
    lines.push(`- ${item}`);
  }

  if (data.output.length > 0) {
    lines.push(`- output: ${data.output.join(", ")}`);
  }

  return lines.join("\n");
}

function formatCodex(data: ParsedPrompt): string {
  const lines: string[] = [`TASK: ${data.task}`];
  lines.push(formatSection("INPUT", data.input));
  lines.push(formatSection("CONSTRAINTS", data.constraints));
  lines.push(formatSection("OUTPUT", data.output));
  return lines.join("\n");
}

function formatClaude(data: ParsedPrompt): string {
  const lines: string[] = [toSentence(data.task)];

  if (data.input.length > 0) {
    lines.push(`Context:\n- ${data.input.join("\n- ")}`);
  }

  if (data.constraints.length > 0) {
    lines.push(`Requirements:\n- ${data.constraints.join("\n- ")}`);
  }

  if (data.output.length > 0) {
    lines.push(`Deliverable:\n- ${data.output.join("\n- ")}`);
  }

  return lines.join("\n\n");
}

function formatGemini(data: ParsedPrompt): string {
  const lines: string[] = [`Goal: ${data.task}`];

  if (data.input.length > 0) {
    lines.push(`Context:\n- ${data.input.join("\n- ")}`);
  }

  if (data.constraints.length > 0) {
    lines.push(`Constraints:\n- ${data.constraints.join("\n- ")}`);
  }

  if (data.output.length > 0) {
    lines.push(`Expected output:\n- ${data.output.join("\n- ")}`);
  }

  return lines.join("\n\n");
}

function formatDeepSeek(data: ParsedPrompt): string {
  const lines: string[] = [`TASK: ${data.task}`];

  if (data.input.length > 0) {
    lines.push(`KEY INPUT:\n- ${data.input.join("\n- ")}`);
  }

  if (data.constraints.length > 0) {
    lines.push(`RULES:\n- ${data.constraints.join("\n- ")}`);
  }

  if (data.output.length > 0) {
    lines.push(`RESULT:\n- ${data.output.join("\n- ")}`);
  }

  return lines.join("\n");
}

function formatSection(title: string, values: string[]): string {
  const items = values.length > 0 ? values : ["none"];
  return `${title}:\n- ${items.join("\n- ")}`;
}

function toSentence(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return "Help with the request.";
  }

  const withCapital = trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
  return /[.!?]$/.test(withCapital) ? withCapital : `${withCapital}.`;
}

function toCursorHeadline(value: string): string {
  return value.trim() || "Refine request";
}
