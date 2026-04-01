export type TargetModel = "chatgpt" | "cursor" | "codex";
export type OutputMode = "replace" | "copy" | "both";

export interface ParsedPrompt {
  task: string;
  input: string[];
  constraints: string[];
  output: string[];
}
