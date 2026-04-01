import * as vscode from "vscode";
import { TargetModel } from "./types";

export type TransformationEngine = "local" | "remote";
export type RemoteProvider = "ollama" | "openai-compatible";
export type OutputLanguage = "english" | "source";

export interface PromptOptimizerConfig {
  transformationEngine: TransformationEngine;
  remoteProvider: RemoteProvider;
  remoteBaseUrl: string;
  remoteApiKey: string;
  remoteModel: string;
  remoteTemperature: number;
  remoteTimeoutMs: number;
  remoteSystemPrompt: string;
  fallbackToLocal: boolean;
  outputLanguage: OutputLanguage;
}

export function getPromptOptimizerConfig(): PromptOptimizerConfig {
  const config = vscode.workspace.getConfiguration("promptOptimizer");

  return {
    transformationEngine: config.get<TransformationEngine>("transformationEngine", "local"),
    remoteProvider: config.get<RemoteProvider>("remote.provider", "ollama"),
    remoteBaseUrl: config.get<string>("remote.baseUrl", "http://127.0.0.1:11434/v1"),
    remoteApiKey: config.get<string>("remote.apiKey", ""),
    remoteModel: config.get<string>("remote.model", "qwen2.5:3b-instruct"),
    remoteTemperature: clamp(config.get<number>("remote.temperature", 0.2), 0, 1),
    remoteTimeoutMs: Math.max(config.get<number>("remote.timeoutMs", 30000), 1000),
    remoteSystemPrompt: config.get<string>("remote.systemPrompt", "").trim(),
    fallbackToLocal: config.get<boolean>("remote.fallbackToLocal", true),
    outputLanguage: config.get<OutputLanguage>("outputLanguage", "english")
  };
}

export function buildRemoteHeaders(config: PromptOptimizerConfig): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json"
  };

  if (config.remoteProvider === "openai-compatible" && config.remoteApiKey.trim()) {
    headers.Authorization = `Bearer ${config.remoteApiKey.trim()}`;
  }

  return headers;
}

export function buildRemotePrompt(text: string, targetModel: TargetModel, outputLanguage: OutputLanguage): string {
  const outputStyle = getOutputStyle(targetModel);
  const languageRule =
    outputLanguage === "english"
      ? "Return English output unless the user explicitly requests another language."
      : "Keep the user's original language when possible.";

  return [
    "Convert the user request into a shorter, clearer prompt for an AI coding assistant.",
    "Do not explain your reasoning.",
    "Do not use markdown code fences.",
    "Keep the output flat and concise.",
    languageRule,
    `Target format: ${outputStyle}`,
    "If details are missing, infer the smallest useful output.",
    "",
    "User request:",
    text
  ].join("\n");
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

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
