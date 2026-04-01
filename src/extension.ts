import * as vscode from "vscode";
import { getPromptOptimizerConfig } from "./config";
import { optimizePrompt } from "./modelTransformer";
import { OutputMode, SourcePayload, TargetModel } from "./types";

const MODEL_ITEMS: Array<{ label: string; model: TargetModel }> = [
  { label: "ChatGPT", model: "chatgpt" },
  { label: "Cursor", model: "cursor" },
  { label: "Codex", model: "codex" },
  { label: "Claude", model: "claude" },
  { label: "Gemini", model: "gemini" },
  { label: "DeepSeek", model: "deepseek" }
];

const OUTPUT_MODE_ITEMS: Array<{ label: string; mode: OutputMode }> = [
  { label: "Replace in editor", mode: "replace" },
  { label: "Copy to clipboard", mode: "copy" },
  { label: "Replace and copy", mode: "both" }
];

export function activate(context: vscode.ExtensionContext): void {
  const runCommand = vscode.commands.registerCommand("promptOptimizer.run", async () => {
    await runOptimizer();
  });

  const setupCommand = vscode.commands.registerCommand("promptOptimizer.setupWizard", async () => {
    await runSetupWizard();
  });

  const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBarItem.text = "$(sparkle) Prompt Optimizer";
  statusBarItem.tooltip = "Optimize prompt";
  statusBarItem.command = "promptOptimizer.run";
  statusBarItem.show();

  context.subscriptions.push(runCommand, setupCommand, statusBarItem);
}

async function runOptimizer(): Promise<void> {
  const pickedModel = await vscode.window.showQuickPick(
    MODEL_ITEMS.map((item) => ({
      label: item.label,
      description: `Optimize prompt for ${item.label}`,
      model: item.model
    })),
    {
      placeHolder: "Select target model"
    }
  );

  if (!pickedModel) {
    return;
  }

  const pickedMode = await vscode.window.showQuickPick(
    OUTPUT_MODE_ITEMS.map((item) => ({
      label: item.label,
      mode: item.mode
    })),
    {
      placeHolder: "Choose how to output the optimized prompt"
    }
  );

  if (!pickedMode) {
    return;
  }

  const editor = vscode.window.activeTextEditor;
  const source = await getSource(editor);
  if (!source) {
    vscode.window.showWarningMessage("No prompt text found. Select text, open a file, or enter text when prompted.");
    return;
  }

  let result: string;

  try {
    result = await optimizePrompt(source.text, pickedModel.model);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown optimization error.";
    vscode.window.showErrorMessage(`Prompt optimization failed: ${message}`);
    return;
  }

  await outputResult(editor, source, result, pickedMode.mode);

  const config = getPromptOptimizerConfig();
  const engineLabel = config.transformationEngine === "remote" ? `remote model: ${config.remoteModel}` : "local rules";
  vscode.window.showInformationMessage(`Prompt optimized for ${pickedModel.label} using ${engineLabel}.`);
}

async function outputResult(
  editor: vscode.TextEditor | undefined,
  source: SourcePayload,
  result: string,
  mode: OutputMode
): Promise<void> {
  if ((mode === "replace" || mode === "both") && source.range && editor) {
    const range = new vscode.Range(
      new vscode.Position(source.range.start.line, source.range.start.character),
      new vscode.Position(source.range.end.line, source.range.end.character)
    );
    await editor.edit((editBuilder) => {
      editBuilder.replace(range, result);
    });
  } else if (mode === "replace") {
    const document = await vscode.workspace.openTextDocument({ content: result, language: "markdown" });
    await vscode.window.showTextDocument(document);
  }

  if (mode === "copy" || mode === "both") {
    await vscode.env.clipboard.writeText(result);
  }
}

async function getSource(editor: vscode.TextEditor | undefined): Promise<SourcePayload | undefined> {
  if (editor) {
    const selection = editor.selection;
    const range = selection.isEmpty
      ? new vscode.Range(editor.document.positionAt(0), editor.document.positionAt(editor.document.getText().length))
      : new vscode.Range(selection.start, selection.end);
    const text = editor.document.getText(range).trim();
    if (text) {
      return {
        text,
        range: {
          start: { line: range.start.line, character: range.start.character },
          end: { line: range.end.line, character: range.end.character }
        }
      };
    }
  }

  const input = await vscode.window.showInputBox({
    prompt: "Paste the prompt to optimize",
    placeHolder: "Example: 帮我写一个带用户名密码校验的 Flutter 登录页面",
    ignoreFocusOut: true
  });

  if (!input || !input.trim()) {
    return undefined;
  }

  return { text: input.trim() };
}

async function runSetupWizard(): Promise<void> {
  const provider = await vscode.window.showQuickPick(
    [
      {
        label: "Ollama",
        description: "Use a local free model through Ollama",
        value: "ollama"
      },
      {
        label: "OpenAI-Compatible",
        description: "Use any compatible hosted endpoint",
        value: "openai-compatible"
      }
    ],
    {
      placeHolder: "Select the provider to configure"
    }
  );

  if (!provider) {
    return;
  }

  const configuration = vscode.workspace.getConfiguration("promptOptimizer");
  await configuration.update("transformationEngine", "remote", vscode.ConfigurationTarget.Global);
  await configuration.update("remote.provider", provider.value, vscode.ConfigurationTarget.Global);

  if (provider.value === "ollama") {
    const baseUrl = await vscode.window.showInputBox({
      prompt: "Ollama base URL",
      value: configuration.get<string>("remote.baseUrl", "http://127.0.0.1:11434/v1"),
      ignoreFocusOut: true
    });
    if (!baseUrl) {
      return;
    }

    const model = await vscode.window.showInputBox({
      prompt: "Ollama model name",
      value: configuration.get<string>("remote.model", "qwen2.5:3b-instruct"),
      ignoreFocusOut: true
    });
    if (!model) {
      return;
    }

    await configuration.update("remote.baseUrl", baseUrl.trim(), vscode.ConfigurationTarget.Global);
    await configuration.update("remote.model", model.trim(), vscode.ConfigurationTarget.Global);
    await configuration.update("remote.apiKey", "", vscode.ConfigurationTarget.Global);
  } else {
    const baseUrl = await vscode.window.showInputBox({
      prompt: "Compatible API base URL",
      value: configuration.get<string>("remote.baseUrl", ""),
      ignoreFocusOut: true
    });
    if (!baseUrl) {
      return;
    }

    const model = await vscode.window.showInputBox({
      prompt: "Model name",
      value: configuration.get<string>("remote.model", ""),
      ignoreFocusOut: true
    });
    if (!model) {
      return;
    }

    const apiKey = await vscode.window.showInputBox({
      prompt: "API key",
      value: configuration.get<string>("remote.apiKey", ""),
      password: true,
      ignoreFocusOut: true
    });
    if (!apiKey) {
      return;
    }

    await configuration.update("remote.baseUrl", baseUrl.trim(), vscode.ConfigurationTarget.Global);
    await configuration.update("remote.model", model.trim(), vscode.ConfigurationTarget.Global);
    await configuration.update("remote.apiKey", apiKey.trim(), vscode.ConfigurationTarget.Global);
  }

  const outputLanguage = await vscode.window.showQuickPick(
    [
      { label: "English", value: "english" },
      { label: "Keep source language", value: "source" }
    ],
    {
      placeHolder: "Select the preferred output language"
    }
  );

  if (outputLanguage) {
    await configuration.update("outputLanguage", outputLanguage.value, vscode.ConfigurationTarget.Global);
  }

  vscode.window.showInformationMessage(`Prompt Optimizer configured for ${provider.label}.`);
}

export function deactivate(): void {
  // No teardown needed for this MVP extension.
}
