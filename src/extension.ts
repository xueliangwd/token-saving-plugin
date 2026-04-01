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

const QUICK_FILL_MODELS: TargetModel[] = ["chatgpt", "codex", "claude", "gemini", "deepseek"];

const OUTPUT_MODE_ITEMS: Array<{ label: string; mode: OutputMode }> = [
  { label: "Replace in editor", mode: "replace" },
  { label: "Open in new editor", mode: "newEditor" },
  { label: "Copy to clipboard", mode: "copy" },
  { label: "Replace and copy", mode: "both" }
];

const CURSOR_CHAT_COMMAND_CANDIDATES = [
  "cursor.chat.open",
  "cursor.openChat",
  "workbench.action.chat.open",
  "workbench.panel.aichat.view.focus",
  "workbench.panel.chat.view.copilot.focus"
];

const ONBOARDING_KEY = "promptOptimizer.onboardingShown";

let autoOptimizeTimer: NodeJS.Timeout | undefined;
let suppressSelectionEventsUntil = 0;
let lastAutoOptimizeSignature = "";
let currentExtensionUri: vscode.Uri | undefined;

export function activate(context: vscode.ExtensionContext): void {
  currentExtensionUri = context.extensionUri;
  const runCommand = vscode.commands.registerCommand("promptOptimizer.run", async () => {
    const model = await pickTargetModel();
    if (!model) {
      return;
    }

    const mode = await pickOutputMode();
    if (!mode) {
      return;
    }

    await optimizeFromEditorOrInput(model, mode);
  });

  const setupCommand = vscode.commands.registerCommand("promptOptimizer.setupWizard", async () => {
    await runSetupWizard();
  });

  const newEditorCommand = vscode.commands.registerCommand("promptOptimizer.sendToNewEditor", async () => {
    const config = getPromptOptimizerConfig();
    await optimizeFromEditorOrInput(config.defaultTargetModel, "newEditor");
  });

  const clipboardCommand = vscode.commands.registerCommand("promptOptimizer.optimizeClipboardPaste", async () => {
    await optimizeClipboardAndPaste();
  });

  const cursorChatCommand = vscode.commands.registerCommand("promptOptimizer.sendToCursorChat", async () => {
    await optimizeForCursorChat();
  });

  const cursorReplaceCommand = vscode.commands.registerCommand("promptOptimizer.quickCursorReplace", async () => {
    await optimizeSelectionDirectly("cursor");
  });

  const quickFillCommands = QUICK_FILL_MODELS.map((model) =>
    vscode.commands.registerCommand(`promptOptimizer.quickFill.${model}`, async () => {
      await quickFillTargetModel(model);
    })
  );

  const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBarItem.text = "$(sparkle) Prompt Optimizer";
  statusBarItem.tooltip = "Optimize prompt";
  statusBarItem.command = "promptOptimizer.run";
  statusBarItem.show();

  const selectionListener = vscode.window.onDidChangeTextEditorSelection(async (event) => {
    await maybeAutoOptimizeSelection(event);
  });

  void maybeShowOnboarding(context);

  context.subscriptions.push(
    runCommand,
    setupCommand,
    newEditorCommand,
    clipboardCommand,
    cursorChatCommand,
    cursorReplaceCommand,
    ...quickFillCommands,
    statusBarItem,
    selectionListener
  );
}

async function maybeShowOnboarding(context: vscode.ExtensionContext): Promise<void> {
  const config = getPromptOptimizerConfig();
  if (!config.onboardingShowOnStartup) {
    return;
  }

  const alreadyShown = context.globalState.get<boolean>(ONBOARDING_KEY, false);
  if (alreadyShown) {
    return;
  }

  await context.globalState.update(ONBOARDING_KEY, true);

  const choice = await vscode.window.showInformationMessage(
    "Prompt Optimizer is ready. You can optimize selected text, send results to a new editor, or copy them into Cursor Chat.",
    "Setup Wizard",
    "Try Cursor Replace",
    "Open README"
  );

  if (choice === "Setup Wizard") {
    await runSetupWizard();
    return;
  }

  if (choice === "Try Cursor Replace") {
    await optimizeSelectionDirectly("cursor");
    return;
  }

  if (choice === "Open README") {
    await openReadme();
  }
}

async function optimizeFromEditorOrInput(targetModel: TargetModel, mode: OutputMode): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  const source = await getSource(editor);
  if (!source) {
    vscode.window.showWarningMessage("No prompt text found. Select text, open a file, or enter text when prompted.");
    return;
  }

  const result = await safelyOptimize(source.text, targetModel);
  if (!result) {
    return;
  }

  await outputResult(editor, source, result, mode);
  showCompletionMessage(targetModel);
}

async function optimizeSelectionDirectly(targetModel: TargetModel): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showWarningMessage("Open a file and select prompt text first.");
    return;
  }

  const selection = editor.selection;
  if (selection.isEmpty) {
    vscode.window.showWarningMessage("Select prompt text to optimize directly.");
    return;
  }

  const text = editor.document.getText(selection).trim();
  if (!text) {
    vscode.window.showWarningMessage("Selected text is empty.");
    return;
  }

  const result = await safelyOptimize(text, targetModel);
  if (!result) {
    return;
  }

  suppressSelectionEventsUntil = Date.now() + 1500;
  await editor.edit((editBuilder) => {
    editBuilder.replace(selection, result);
  });

  showCompletionMessage(targetModel, "editor");
}

async function quickFillTargetModel(targetModel: TargetModel): Promise<void> {
  const source = await getSource(vscode.window.activeTextEditor, {
    preferClipboardFallback: true,
    promptForMissingInput: false
  });
  if (!source) {
    vscode.window.showWarningMessage("No source text found in selection, editor, or clipboard.");
    return;
  }

  const result = await safelyOptimize(source.text, targetModel);
  if (!result) {
    return;
  }

  await vscode.env.clipboard.writeText(result);

  if (vscode.window.activeTextEditor && getPromptOptimizerConfig().clipboardAutoPasteToActiveEditor) {
    await vscode.commands.executeCommand("editor.action.clipboardPasteAction");
    showCompletionMessage(targetModel, "active editor");
    return;
  }

  await openInNewEditor(
    [
      `# ${getModelLabel(targetModel)} Prompt`,
      "",
      "The optimized prompt is copied to your clipboard.",
      "Paste it into the target AI input box when ready.",
      "",
      result
    ].join("\n")
  );
  showCompletionMessage(targetModel, "clipboard");
}

async function optimizeClipboardAndPaste(): Promise<void> {
  const config = getPromptOptimizerConfig();
  const clipboardText = (await vscode.env.clipboard.readText()).trim();
  if (!clipboardText) {
    vscode.window.showWarningMessage("Clipboard is empty.");
    return;
  }

  const result = await safelyOptimize(clipboardText, config.defaultTargetModel);
  if (!result) {
    return;
  }

  await vscode.env.clipboard.writeText(result);

  if (config.clipboardAutoPasteToActiveEditor && vscode.window.activeTextEditor) {
    await vscode.commands.executeCommand("editor.action.clipboardPasteAction");
  } else {
    await openInNewEditor(result);
  }

  showCompletionMessage(config.defaultTargetModel, "clipboard");
}

async function optimizeForCursorChat(): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  const source = await getSource(editor, { preferClipboardFallback: true, promptForMissingInput: false });
  if (!source) {
    vscode.window.showWarningMessage("No source text found in selection, editor, or clipboard.");
    return;
  }

  const result = await safelyOptimize(source.text, "cursor");
  if (!result) {
    return;
  }

  await vscode.env.clipboard.writeText(result);

  const config = getPromptOptimizerConfig();
  const openedChat = config.cursorChatOpenAfterCopy ? await focusCursorChat() : false;

  if (!openedChat) {
    await openInNewEditor(
      [
        "# Cursor Chat Prompt",
        "",
        "The optimized Cursor-style prompt is copied to your clipboard.",
        "Paste it into Cursor Chat or Composer to continue.",
        "",
        result
      ].join("\n")
    );
  }

  showCompletionMessage("cursor", openedChat ? "cursor chat" : "clipboard");
}

async function maybeAutoOptimizeSelection(event: vscode.TextEditorSelectionChangeEvent): Promise<void> {
  const config = getPromptOptimizerConfig();
  if (!config.selectionAutoOptimizeEnabled) {
    return;
  }

  if (Date.now() < suppressSelectionEventsUntil) {
    return;
  }

  const editor = event.textEditor;
  const selection = editor.selection;
  if (selection.isEmpty) {
    return;
  }

  const selectedText = editor.document.getText(selection).trim();
  if (!selectedText || selectedText.length > 3000) {
    return;
  }

  const signature = [
    editor.document.uri.toString(),
    selection.start.line,
    selection.start.character,
    selection.end.line,
    selection.end.character,
    selectedText
  ].join(":");

  if (signature === lastAutoOptimizeSignature) {
    return;
  }

  lastAutoOptimizeSignature = signature;

  if (autoOptimizeTimer) {
    clearTimeout(autoOptimizeTimer);
  }

  autoOptimizeTimer = setTimeout(async () => {
    const currentConfig = getPromptOptimizerConfig();
    try {
      const result = await optimizePrompt(selectedText, currentConfig.defaultTargetModel);
      suppressSelectionEventsUntil = Date.now() + 1500;
      await editor.edit((editBuilder) => {
        editBuilder.replace(selection, result);
      });
      vscode.window.setStatusBarMessage("Prompt Optimizer: selection auto-optimized", 1800);
    } catch {
      // Keep auto mode quiet on failure.
    }
  }, config.selectionAutoOptimizeDebounceMs);
}

async function safelyOptimize(text: string, targetModel: TargetModel): Promise<string | undefined> {
  try {
    return await optimizePrompt(text, targetModel);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown optimization error.";
    vscode.window.showErrorMessage(`Prompt optimization failed: ${message}`);
    return undefined;
  }
}

async function outputResult(
  editor: vscode.TextEditor | undefined,
  source: SourcePayload,
  result: string,
  mode: OutputMode
): Promise<void> {
  if (mode === "newEditor") {
    await openInNewEditor(result);
    return;
  }

  if ((mode === "replace" || mode === "both") && source.range && editor) {
    const range = new vscode.Range(
      new vscode.Position(source.range.start.line, source.range.start.character),
      new vscode.Position(source.range.end.line, source.range.end.character)
    );
    await editor.edit((editBuilder) => {
      editBuilder.replace(range, result);
    });
  } else if (mode === "replace") {
    await openInNewEditor(result);
  }

  if (mode === "copy" || mode === "both") {
    await vscode.env.clipboard.writeText(result);
  }
}

async function openInNewEditor(content: string): Promise<void> {
  const document = await vscode.workspace.openTextDocument({
    content,
    language: "markdown"
  });
  await vscode.window.showTextDocument(document, {
    preview: false
  });
}

async function openReadme(): Promise<void> {
  const baseUri =
    currentExtensionUri ??
    vscode.extensions.all.find((extension) => extension.packageJSON?.name === "token-saving-plugin")?.extensionUri;

  if (!baseUri) {
    return;
  }

  const readmeUri = vscode.Uri.joinPath(baseUri, "README.md");
  try {
    const document = await vscode.workspace.openTextDocument(readmeUri);
    await vscode.window.showTextDocument(document, { preview: false });
  } catch {
    // Ignore if README cannot be resolved in a packaged extension context.
  }
}

async function getSource(
  editor: vscode.TextEditor | undefined,
  options?: {
    preferClipboardFallback?: boolean;
    promptForMissingInput?: boolean;
  }
): Promise<SourcePayload | undefined> {
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

  if (options?.preferClipboardFallback) {
    const clipboardText = (await vscode.env.clipboard.readText()).trim();
    if (clipboardText) {
      return { text: clipboardText };
    }
  }

  if (options?.promptForMissingInput === false) {
    return undefined;
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

async function pickTargetModel(): Promise<TargetModel | undefined> {
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

  return pickedModel?.model;
}

async function pickOutputMode(): Promise<OutputMode | undefined> {
  const pickedMode = await vscode.window.showQuickPick(
    OUTPUT_MODE_ITEMS.map((item) => ({
      label: item.label,
      mode: item.mode
    })),
    {
      placeHolder: "Choose how to output the optimized prompt"
    }
  );

  return pickedMode?.mode;
}

function showCompletionMessage(targetModel: TargetModel, destination?: string): void {
  const config = getPromptOptimizerConfig();
  const engineLabel = config.transformationEngine === "remote" ? `remote model: ${config.remoteModel}` : "local rules";
  const suffix = destination ? ` to ${destination}` : "";
  vscode.window.showInformationMessage(`Prompt optimized for ${getModelLabel(targetModel)}${suffix} using ${engineLabel}.`);
}

function getModelLabel(targetModel: TargetModel): string {
  return MODEL_ITEMS.find((item) => item.model === targetModel)?.label ?? targetModel;
}

async function focusCursorChat(): Promise<boolean> {
  for (const command of CURSOR_CHAT_COMMAND_CANDIDATES) {
    try {
      await vscode.commands.executeCommand(command);
      return true;
    } catch {
      // Try the next candidate command.
    }
  }

  return false;
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
  if (autoOptimizeTimer) {
    clearTimeout(autoOptimizeTimer);
  }
}
