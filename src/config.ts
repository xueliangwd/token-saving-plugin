import * as vscode from "vscode";
import { OptimizationSettings, OutputLanguage, RemoteProvider, TargetModel, TransformationEngine } from "./types";

export interface PromptOptimizerConfig {
  transformationEngine: TransformationEngine;
  outputLanguage: OutputLanguage;
  defaultTargetModel: TargetModel;
  clipboardAutoPasteToActiveEditor: boolean;
  cursorChatOpenAfterCopy: boolean;
  selectionAutoOptimizeEnabled: boolean;
  selectionAutoOptimizeDebounceMs: number;
  onboardingShowOnStartup: boolean;
  commonRulesEnabled: boolean;
  commonRulesAppendBuiltIn: boolean;
  commonRulesCustomRules: string[];
  mcpDefaultTargetModel: TargetModel;
  mcpPreviewBeforeSend: boolean;
  mcpAutoSend: boolean;
  remoteProvider: RemoteProvider;
  remoteBaseUrl: string;
  remoteApiKey: string;
  remoteModel: string;
  remoteTemperature: number;
  remoteTimeoutMs: number;
  remoteSystemPrompt: string;
  fallbackToLocal: boolean;
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
    outputLanguage: config.get<OutputLanguage>("outputLanguage", "english"),
    defaultTargetModel: config.get<TargetModel>("defaultTargetModel", "cursor"),
    clipboardAutoPasteToActiveEditor: config.get<boolean>("clipboard.autoPasteToActiveEditor", true),
    cursorChatOpenAfterCopy: config.get<boolean>("cursorChat.openAfterCopy", true),
    selectionAutoOptimizeEnabled: config.get<boolean>("selectionAutoOptimize.enabled", false),
    selectionAutoOptimizeDebounceMs: Math.max(config.get<number>("selectionAutoOptimize.debounceMs", 600), 150),
    onboardingShowOnStartup: config.get<boolean>("onboarding.showOnStartup", true),
    commonRulesEnabled: config.get<boolean>("commonRules.enabled", true),
    commonRulesAppendBuiltIn: config.get<boolean>("commonRules.appendBuiltIn", true),
    commonRulesCustomRules: sanitizeRules(config.get<unknown>("commonRules.customRules", [])),
    mcpDefaultTargetModel: config.get<TargetModel>("mcp.defaultTargetModel", "cursor"),
    mcpPreviewBeforeSend: config.get<boolean>("mcp.previewBeforeSend", true),
    mcpAutoSend: config.get<boolean>("mcp.autoSend", false)
  };
}

export function toOptimizationSettings(config: PromptOptimizerConfig): OptimizationSettings {
  return {
    transformationEngine: config.transformationEngine,
    outputLanguage: config.outputLanguage,
    remote: {
      provider: config.remoteProvider,
      baseUrl: config.remoteBaseUrl,
      apiKey: config.remoteApiKey,
      model: config.remoteModel,
      temperature: config.remoteTemperature,
      timeoutMs: config.remoteTimeoutMs,
      systemPrompt: config.remoteSystemPrompt,
      fallbackToLocal: config.fallbackToLocal
    },
    commonRules: {
      enabled: config.commonRulesEnabled,
      appendBuiltIn: config.commonRulesAppendBuiltIn,
      customRules: config.commonRulesCustomRules
    }
  };
}

function sanitizeRules(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }

  if (typeof value === "string") {
    return value
      .split(/\r?\n|,/)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [];
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
