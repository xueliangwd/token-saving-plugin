import * as vscode from "vscode";
import { getPromptOptimizerConfig } from "./config";
import { getModelIcon, getModelLabel, t } from "./i18n";
import { buildMcpConfigSnippet, getBundledMcpServerPath, getMcpForwardingSummary } from "./mcpSupport";
import { optimizePrompt, optimizePromptDetailed } from "./modelTransformer";
import { McpClient, OutputMode, SourcePayload, TargetModel } from "./types";

const MODEL_ITEMS: Array<{ label: string; model: TargetModel }> = [
  { label: "ChatGPT", model: "chatgpt" },
  { label: "Cursor", model: "cursor" },
  { label: "Codex", model: "codex" },
  { label: "Claude", model: "claude" },
  { label: "Gemini", model: "gemini" },
  { label: "DeepSeek", model: "deepseek" }
];

const QUICK_FILL_MODELS: TargetModel[] = ["chatgpt", "codex", "claude", "gemini", "deepseek"];
const MCP_CLIENT_ITEMS: Array<{ label: string; client: McpClient }> = [
  { label: "Cursor", client: "cursor" },
  { label: "Claude Desktop", client: "claude-desktop" },
  { label: "Cline / Roo / Continue", client: "cline" },
  { label: "Generic MCP Client", client: "generic" }
];

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
const UI_LANGUAGE_KEY = "promptOptimizer.lastUiLanguage";
const RECENT_MODELS_KEY = "promptOptimizer.recentModels";

let autoOptimizeTimer: NodeJS.Timeout | undefined;
let suppressSelectionEventsUntil = 0;
let lastAutoOptimizeSignature = "";
let currentExtensionUri: vscode.Uri | undefined;
let primaryStatusBarItem: vscode.StatusBarItem | undefined;
let modelStatusBarItem: vscode.StatusBarItem | undefined;
let extensionContextRef: vscode.ExtensionContext | undefined;

export function activate(context: vscode.ExtensionContext): void {
  currentExtensionUri = context.extensionUri;
  extensionContextRef = context;
  void maybePromptForLanguageReload(context);
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

  const statusModelCommand = vscode.commands.registerCommand("promptOptimizer.statusBarModels", async () => {
    await runStatusBarModelPicker();
  });

  const quickFillCommands = QUICK_FILL_MODELS.map((model) =>
    vscode.commands.registerCommand(`promptOptimizer.quickFill.${model}`, async () => {
      await quickFillTargetModel(model);
    })
  );
  const copyMcpConfigCommand = vscode.commands.registerCommand("promptOptimizer.copyMcpConfig", async () => {
    await copyMcpConfigSnippet();
  });
  const openMcpGuideCommand = vscode.commands.registerCommand("promptOptimizer.openMcpGuide", async () => {
    await openReadme();
  });
  const mcpPreviewCommand = vscode.commands.registerCommand("promptOptimizer.mcpInterceptPreview", async () => {
    await runMcpInterceptPreview();
  });

  primaryStatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  primaryStatusBarItem.text = t("status.primary");
  primaryStatusBarItem.tooltip = t("status.primaryTooltip");
  primaryStatusBarItem.command = "promptOptimizer.run";
  primaryStatusBarItem.show();

  modelStatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 99);
  modelStatusBarItem.text = `$(chevron-down) ${getModelIcon(getPromptOptimizerConfig().defaultTargetModel)} ${getModelLabel(getPromptOptimizerConfig().defaultTargetModel)}`;
  modelStatusBarItem.tooltip = t("status.modelsTooltip");
  modelStatusBarItem.command = "promptOptimizer.statusBarModels";
  modelStatusBarItem.show();

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
    statusModelCommand,
    copyMcpConfigCommand,
    openMcpGuideCommand,
    mcpPreviewCommand,
    ...quickFillCommands,
    primaryStatusBarItem,
    modelStatusBarItem,
    selectionListener
  );
}

async function maybePromptForLanguageReload(context: vscode.ExtensionContext): Promise<void> {
  const previousLanguage = context.globalState.get<string>(UI_LANGUAGE_KEY);
  const currentLanguage = vscode.env.language;
  await context.globalState.update(UI_LANGUAGE_KEY, currentLanguage);

  if (!previousLanguage || previousLanguage === currentLanguage) {
    return;
  }

  const choice = await vscode.window.showInformationMessage(
    t("languageChange.message"),
    t("languageChange.reload")
  );

  if (choice === t("languageChange.reload")) {
    await vscode.commands.executeCommand("workbench.action.reloadWindow");
  }
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
    `${t("onboarding.message")} ${t("visibility.help")}`,
    t("onboarding.setup"),
    t("onboarding.tryCursor"),
    t("onboarding.readme")
  );

  if (choice === t("onboarding.setup")) {
    await runSetupWizard();
    return;
  }

  if (choice === t("onboarding.tryCursor")) {
    await optimizeSelectionDirectly("cursor");
    return;
  }

  if (choice === t("onboarding.readme")) {
    await openReadme();
  }
}

async function runStatusBarModelPicker(): Promise<void> {
  const config = getPromptOptimizerConfig();
  const recentModels = getRecentModels();
  const sortedModels = sortModelsByRecency(config.defaultTargetModel, recentModels);
  const picked = await vscode.window.showQuickPick(
    sortedModels.map((item) => ({
      label: `${getModelIcon(item.model)} ${getModelLabel(item.model)}`,
      description: item.model === config.defaultTargetModel ? t("picker.default") : t("picker.quickFill"),
      model: item.model
    })),
    {
      placeHolder: t("picker.statusModelPlaceholder")
    }
  );

  if (!picked) {
    return;
  }

  await vscode.workspace
    .getConfiguration("promptOptimizer")
    .update("defaultTargetModel", picked.model, vscode.ConfigurationTarget.Global);
  updateStatusBarModelLabel(picked.model);
  pushRecentModel(picked.model);

  if (picked.model === "cursor") {
    await optimizeSelectionDirectly("cursor");
    return;
  }

  await quickFillTargetModel(picked.model);
}

async function optimizeFromEditorOrInput(targetModel: TargetModel, mode: OutputMode): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  const source = await getSource(editor);
  if (!source) {
    vscode.window.showWarningMessage(t("warning.noPrompt"));
    return;
  }

  const result = await safelyOptimize(source.text, targetModel);
  if (!result) {
    return;
  }

  await outputResult(editor, source, result, mode);
  showCompletionMessage(targetModel);
  updateStatusBarModelLabel(targetModel);
  pushRecentModel(targetModel);
}

async function optimizeSelectionDirectly(targetModel: TargetModel): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showWarningMessage(t("warning.openFileAndSelect"));
    return;
  }

  const selection = editor.selection;
  if (selection.isEmpty) {
    vscode.window.showWarningMessage(t("warning.selectPrompt"));
    return;
  }

  const text = editor.document.getText(selection).trim();
  if (!text) {
    vscode.window.showWarningMessage(t("warning.selectionEmpty"));
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
  updateStatusBarModelLabel(targetModel);
  pushRecentModel(targetModel);
}

async function quickFillTargetModel(targetModel: TargetModel): Promise<void> {
  const source = await getSource(vscode.window.activeTextEditor, {
    preferClipboardFallback: true,
    promptForMissingInput: false
  });
  if (!source) {
    vscode.window.showWarningMessage(t("warning.noSourceAnywhere"));
    return;
  }

  const result = await safelyOptimize(source.text, targetModel);
  if (!result) {
    return;
  }

  await vscode.env.clipboard.writeText(result);

  if (vscode.window.activeTextEditor && getPromptOptimizerConfig().clipboardAutoPasteToActiveEditor) {
    await vscode.commands.executeCommand("editor.action.clipboardPasteAction");
    showPasteHint(targetModel, "已自动粘贴到当前编辑器");
    showCompletionMessage(targetModel, "active editor");
    updateStatusBarModelLabel(targetModel);
    pushRecentModel(targetModel);
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
  showPasteHint(targetModel, "已复制到剪贴板，可粘贴到目标 AI 输入框");
  showCompletionMessage(targetModel, "clipboard");
  updateStatusBarModelLabel(targetModel);
  pushRecentModel(targetModel);
}

async function optimizeClipboardAndPaste(): Promise<void> {
  const config = getPromptOptimizerConfig();
  const clipboardText = (await vscode.env.clipboard.readText()).trim();
  if (!clipboardText) {
    vscode.window.showWarningMessage(t("warning.clipboardEmpty"));
    return;
  }

  const result = await safelyOptimize(clipboardText, config.defaultTargetModel);
  if (!result) {
    return;
  }

  await vscode.env.clipboard.writeText(result);

  if (config.clipboardAutoPasteToActiveEditor && vscode.window.activeTextEditor) {
    await vscode.commands.executeCommand("editor.action.clipboardPasteAction");
    showPasteHint(config.defaultTargetModel, "已自动粘贴优化结果");
  } else {
    await openInNewEditor(result);
    showPasteHint(config.defaultTargetModel, "已复制优化结果，请粘贴到目标输入框");
  }

  showCompletionMessage(config.defaultTargetModel, "clipboard");
  updateStatusBarModelLabel(config.defaultTargetModel);
  pushRecentModel(config.defaultTargetModel);
}

async function optimizeForCursorChat(): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  const source = await getSource(editor, { preferClipboardFallback: true, promptForMissingInput: false });
  if (!source) {
    vscode.window.showWarningMessage(t("warning.noSourceAnywhere"));
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
    showPasteHint("cursor", "已复制 Cursor 风格提示词，请粘贴到 Cursor Chat");
  } else {
    showPasteHint("cursor", "已复制 Cursor 风格提示词，可直接粘贴到聊天框");
  }

  showCompletionMessage("cursor", openedChat ? "cursor chat" : "clipboard");
  updateStatusBarModelLabel("cursor");
  pushRecentModel("cursor");
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
  if (!isEligibleAutoOptimizeDocument(editor, config.selectionAutoOptimizeDocumentPrefix)) {
    return;
  }
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
      vscode.window.setStatusBarMessage(t("message.autoOptimized"), 1800);
      updateStatusBarModelLabel(currentConfig.defaultTargetModel);
    } catch {
      // Keep auto mode quiet on failure.
    }
  }, config.selectionAutoOptimizeDebounceMs);
}

function isEligibleAutoOptimizeDocument(editor: vscode.TextEditor, requiredPrefix: string): boolean {
  const prefix = requiredPrefix.trim();
  if (!prefix) {
    return false;
  }

  const headText = editor.document.getText(new vscode.Range(0, 0, Math.min(editor.document.lineCount - 1, 4), 200));
  return headText.trimStart().startsWith(prefix);
}

async function runMcpInterceptPreview(): Promise<void> {
  const config = getPromptOptimizerConfig();
  const source = await getSource(vscode.window.activeTextEditor, {
    preferClipboardFallback: true,
    promptForMissingInput: true
  });
  if (!source) {
    vscode.window.showWarningMessage(t("warning.noSourceAnywhere"));
    return;
  }

  const result = await safelyOptimizeDetailed(source.text, config.mcpDefaultTargetModel);
  if (!result) {
    return;
  }

  const forwarding = getMcpForwardingSummary(
    config.mcpDefaultTargetModel,
    config.mcpPreviewBeforeSend,
    config.mcpAutoSend
  );

  await openInNewEditor(
    [
      "# MCP Intercept Preview",
      "",
      `- target: ${getModelLabel(config.mcpDefaultTargetModel)}`,
      `- engine: ${result.engineUsed}`,
      `- common rules: ${result.appliedCommonRules.length > 0 ? "enabled" : "disabled"}`,
      `- forwarding: ${forwarding}`,
      "",
      "## Optimized Prompt",
      "",
      result.optimizedPrompt
    ].join("\n")
  );

  await vscode.env.clipboard.writeText(result.optimizedPrompt);

  if (!config.mcpPreviewBeforeSend && config.mcpAutoSend) {
    if (vscode.window.activeTextEditor && config.clipboardAutoPasteToActiveEditor) {
      await vscode.commands.executeCommand("editor.action.clipboardPasteAction");
      showPasteHint(config.mcpDefaultTargetModel, t("mcp.autosendActiveEditor"));
      return;
    }
    showPasteHint(config.mcpDefaultTargetModel, t("mcp.autosendClipboard"));
    return;
  }

  showPasteHint(config.mcpDefaultTargetModel, t("mcp.previewReady"));
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

async function safelyOptimizeDetailed(text: string, targetModel: TargetModel) {
  try {
    return await optimizePromptDetailed(text, targetModel);
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

async function copyMcpConfigSnippet(): Promise<void> {
  const picked = await vscode.window.showQuickPick(
    MCP_CLIENT_ITEMS.map((item) => ({
      label: item.label,
      client: item.client
    })),
    {
      placeHolder: t("picker.mcpClientPlaceholder")
    }
  );

  if (!picked) {
    return;
  }

  const basePath =
    currentExtensionUri?.fsPath ??
    vscode.extensions.all.find((extension) => extension.packageJSON?.name === "token-saving-plugin")?.extensionUri.fsPath;
  if (!basePath) {
    vscode.window.showWarningMessage(t("warning.mcpPathUnavailable"));
    return;
  }

  const snippet = buildMcpConfigSnippet(picked.client, getBundledMcpServerPath(basePath));
  await vscode.env.clipboard.writeText(snippet);
  await openInNewEditor(snippet);
  vscode.window.showInformationMessage(t("message.mcpConfigCopied"));
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
      label: `${getModelIcon(item.model)} ${getModelLabel(item.model)}`,
      description: `Optimize prompt for ${getModelLabel(item.model)}`,
      model: item.model
    })),
    {
      placeHolder: t("picker.modelPlaceholder")
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
      placeHolder: t("picker.outputPlaceholder")
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

function showPasteHint(targetModel: TargetModel, detail: string): void {
  void vscode.window.showInformationMessage(
    `${getModelLabel(targetModel)} 已准备好，${detail}`,
    t("hint.openNewEditor"),
    t("hint.setupWizard")
  ).then(async (choice) => {
    if (choice === t("hint.openNewEditor")) {
      const clipboardText = await vscode.env.clipboard.readText();
      if (clipboardText.trim()) {
        await openInNewEditor(clipboardText);
      }
    }
    if (choice === t("hint.setupWizard")) {
      await runSetupWizard();
    }
  });
}

function updateStatusBarModelLabel(targetModel: TargetModel): void {
  if (!modelStatusBarItem) {
    return;
  }

  modelStatusBarItem.text = `$(chevron-down) ${getModelIcon(targetModel)} ${getModelLabel(targetModel)}`;
}

function getRecentModels(): TargetModel[] {
  const raw = extensionContextRef?.globalState.get<string[]>(RECENT_MODELS_KEY, []) ?? [];
  return raw.filter((item): item is TargetModel => MODEL_ITEMS.some((model) => model.model === item));
}

function pushRecentModel(targetModel: TargetModel): void {
  const raw = getRecentModels().filter((item) => item !== targetModel);
  const next = [targetModel, ...raw].slice(0, 4);
  void extensionContextRef?.globalState.update(RECENT_MODELS_KEY, next);
}

function sortModelsByRecency(defaultTargetModel: TargetModel, recentModels: TargetModel[]): Array<{ label: string; model: TargetModel }> {
  const rank = new Map<TargetModel, number>();
  recentModels.forEach((model, index) => rank.set(model, index));

  return [...MODEL_ITEMS].sort((left, right) => {
    const leftRank = rank.get(left.model);
    const rightRank = rank.get(right.model);

    if (leftRank !== undefined || rightRank !== undefined) {
      if (leftRank === undefined) {
        return 1;
      }
      if (rightRank === undefined) {
        return -1;
      }
      return leftRank - rightRank;
    }

    if (left.model === defaultTargetModel) {
      return -1;
    }
    if (right.model === defaultTargetModel) {
      return 1;
    }

    return left.label.localeCompare(right.label);
  });
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
        label: "Ollama / 本地免费模型",
        description: "Use a local free model through Ollama",
        value: "ollama"
      },
      {
        label: "OpenAI-Compatible / 兼容接口",
        description: "Use any compatible hosted endpoint",
        value: "openai-compatible"
      }
    ],
    {
      placeHolder: "Select the provider to configure / 选择模型接口"
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
      prompt: "Ollama base URL / 地址",
      value: configuration.get<string>("remote.baseUrl", "http://127.0.0.1:11434/v1"),
      ignoreFocusOut: true
    });
    if (!baseUrl) {
      return;
    }

    const model = await vscode.window.showInputBox({
      prompt: "Ollama model name / 模型名",
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
      prompt: "Compatible API base URL / 接口地址",
      value: configuration.get<string>("remote.baseUrl", ""),
      ignoreFocusOut: true
    });
    if (!baseUrl) {
      return;
    }

    const model = await vscode.window.showInputBox({
      prompt: "Model name / 模型名",
      value: configuration.get<string>("remote.model", ""),
      ignoreFocusOut: true
    });
    if (!model) {
      return;
    }

    const apiKey = await vscode.window.showInputBox({
      prompt: "API key / 密钥",
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
      { label: "English / 英文输出", value: "english" },
      { label: "Keep source language / 保持原语言", value: "source" }
    ],
    {
      placeHolder: "Select preferred output language / 选择输出语言"
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
