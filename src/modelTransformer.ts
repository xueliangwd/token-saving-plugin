import { getPromptOptimizerConfig, toOptimizationSettings } from "./config";
import { optimizePromptWithSettings } from "./optimizerCore";
import { OptimizationResult, TargetModel } from "./types";

export async function optimizePrompt(text: string, targetModel: TargetModel): Promise<string> {
  const result = await optimizePromptDetailed(text, targetModel);
  return result.optimizedPrompt;
}

export async function optimizePromptDetailed(text: string, targetModel: TargetModel): Promise<OptimizationResult> {
  const config = getPromptOptimizerConfig();
  return optimizePromptWithSettings(text, targetModel, toOptimizationSettings(config));
}
