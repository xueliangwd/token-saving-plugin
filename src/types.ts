export type TargetModel = "chatgpt" | "cursor" | "codex" | "claude" | "gemini" | "deepseek";
export type OutputMode = "replace" | "newEditor" | "copy" | "both";
export type TransformationEngine = "local" | "remote";
export type RemoteProvider = "ollama" | "openai-compatible";
export type OutputLanguage = "english" | "source";
export type McpClient = "cursor" | "cline" | "claude-desktop" | "generic";

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

export interface CommonRulesConfig {
  enabled: boolean;
  appendBuiltIn: boolean;
  customRules: string[];
}

export interface ModelStrategy {
  remoteGuidance: string[];
  maxInput: number;
  maxConstraints: number;
  maxOutput: number;
}

export interface RemoteConfig {
  provider: RemoteProvider;
  baseUrl: string;
  apiKey: string;
  model: string;
  temperature: number;
  timeoutMs: number;
  systemPrompt: string;
  fallbackToLocal: boolean;
}

export interface OptimizationSettings {
  transformationEngine: TransformationEngine;
  outputLanguage: OutputLanguage;
  remote: RemoteConfig;
  commonRules: CommonRulesConfig;
}

export interface OptimizationResult {
  optimizedPrompt: string;
  parsed: ParsedPrompt;
  appliedCommonRules: string[];
  engineUsed: TransformationEngine;
  normalizedFromRemote: boolean;
}
