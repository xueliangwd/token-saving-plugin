export type TargetModel = "chatgpt" | "cursor" | "codex" | "claude" | "gemini" | "deepseek";
export type OutputMode = "replace" | "copy" | "both";

export interface ParsedPrompt {
  task: string;
  input: string[];
  constraints: string[];
  output: string[];
}

export interface SourcePayload {
  text: string;
  range?: {
    start: { line: number; character: number };
    end: { line: number; character: number };
  };
}
