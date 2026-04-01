import * as vscode from "vscode";
import { getPromptOptimizerConfig } from "./config";
import { optimizePrompt } from "./modelTransformer";
import { OutputMode, TargetModel } from "./types";

const MODEL_ITEMS: Array<{ label: string; model: TargetModel }> = [
  { label: "ChatGPT", model: "chatgpt" },
  { label: "Cursor", model: "cursor" },
  { label: "Codex", model: "codex" }
];

const OUTPUT_MODE_ITEMS: Array<{ label: string; mode: OutputMode }> = [
  { label: "Replace in editor", mode: "replace" },
  { label: "Copy to clipboard", mode: "copy" },
  { label: "Replace and copy", mode: "both" }
];

export function activate(context: vscode.ExtensionContext): void {
  const disposable = vscode.commands.registerCommand("promptOptimizer.run", async () => {
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

    if ((pickedMode.mode === "replace" || pickedMode.mode === "both") && source.range && editor) {
      await editor.edit((editBuilder) => {
        editBuilder.replace(source.range!, result);
      });
    } else if (pickedMode.mode === "replace") {
      const document = await vscode.workspace.openTextDocument({ content: result, language: "markdown" });
      await vscode.window.showTextDocument(document);
    }

    if (pickedMode.mode === "copy" || pickedMode.mode === "both") {
      await vscode.env.clipboard.writeText(result);
    }

    const config = getPromptOptimizerConfig();
    const engineLabel = config.transformationEngine === "remote" ? `remote model: ${config.remoteModel}` : "local rules";
    vscode.window.showInformationMessage(`Prompt optimized for ${pickedModel.label} using ${engineLabel}.`);
  });

  context.subscriptions.push(disposable);
}

async function getSource(
  editor: vscode.TextEditor | undefined
): Promise<{ text: string; range?: vscode.Range } | undefined> {
  if (editor) {
    const selection = editor.selection;
    const range = selection.isEmpty
      ? new vscode.Range(editor.document.positionAt(0), editor.document.positionAt(editor.document.getText().length))
      : new vscode.Range(selection.start, selection.end);
    const text = editor.document.getText(range).trim();
    if (text) {
      return { text, range };
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

export function deactivate(): void {
  // No teardown needed for this MVP extension.
}
