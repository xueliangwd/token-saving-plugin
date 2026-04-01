import * as vscode from "vscode";
import { TargetModel } from "./types";

type Locale = "zh" | "en";

type Key =
  | "status.primary"
  | "status.primaryTooltip"
  | "status.modelsTooltip"
  | "onboarding.message"
  | "onboarding.setup"
  | "onboarding.tryCursor"
  | "onboarding.readme"
  | "languageChange.message"
  | "languageChange.reload"
  | "picker.modelPlaceholder"
  | "picker.outputPlaceholder"
  | "picker.statusModelPlaceholder"
  | "picker.mcpClientPlaceholder"
  | "picker.default"
  | "picker.quickFill"
  | "warning.noPrompt"
  | "warning.openFileAndSelect"
  | "warning.selectPrompt"
  | "warning.selectionEmpty"
  | "warning.noSourceAnywhere"
  | "warning.clipboardEmpty"
  | "warning.mcpPathUnavailable"
  | "hint.openNewEditor"
  | "hint.setupWizard"
  | "message.autoOptimized"
  | "message.setupDone"
  | "message.mcpConfigCopied"
  | "mcp.previewReady"
  | "mcp.autosendActiveEditor"
  | "mcp.autosendClipboard"
  | "source.readme"
  | "source.cursorChat"
  | "source.clipboard"
  | "source.activeEditor"
  | "source.editor"
  | "visibility.help";

const TEXT: Record<Locale, Record<Key, string>> = {
  zh: {
    "status.primary": "$(sparkle) Prompt 优化",
    "status.primaryTooltip": "优化提示词",
    "status.modelsTooltip": "快速模型入口",
    "onboarding.message": "Prompt Optimizer 已就绪。你可以直接优化选中文本、发到新编辑器，或复制到 Cursor Chat。",
    "onboarding.setup": "设置向导",
    "onboarding.tryCursor": "试用 Cursor 替换",
    "onboarding.readme": "打开说明",
    "languageChange.message": "检测到界面语言已切换。重载窗口后，命令标题和设置说明会更新为当前语言。",
    "languageChange.reload": "立即重载",
    "picker.modelPlaceholder": "选择目标模型",
    "picker.outputPlaceholder": "选择输出方式",
    "picker.statusModelPlaceholder": "选择目标模型",
    "picker.mcpClientPlaceholder": "选择要接入 MCP 的客户端",
    "picker.default": "默认",
    "picker.quickFill": "快速填充",
    "warning.noPrompt": "未找到提示词文本。请先选择文本、打开文件，或手动输入。",
    "warning.openFileAndSelect": "请先打开文件并选择提示词文本。",
    "warning.selectPrompt": "请选择要直接优化的提示词文本。",
    "warning.selectionEmpty": "选中文本为空。",
    "warning.noSourceAnywhere": "未在选区、编辑器或剪贴板中找到可用内容。",
    "warning.clipboardEmpty": "剪贴板为空。",
    "warning.mcpPathUnavailable": "无法定位插件内置 MCP server 路径。",
    "hint.openNewEditor": "打开新编辑器",
    "hint.setupWizard": "设置向导",
    "message.autoOptimized": "Prompt Optimizer: 选中文本已自动优化",
    "message.setupDone": "Prompt Optimizer 已完成配置：{provider}",
    "message.mcpConfigCopied": "MCP 配置片段已复制，并已在新编辑器中打开。",
    "mcp.previewReady": "已生成预览并复制到剪贴板，可手动发送到原始链路。",
    "mcp.autosendActiveEditor": "已按 MCP 自动发送配置粘贴到当前编辑器。",
    "mcp.autosendClipboard": "已按 MCP 自动发送配置复制结果，请转发到原始链路。",
    "source.readme": "打开说明",
    "source.cursorChat": "Cursor Chat",
    "source.clipboard": "剪贴板",
    "source.activeEditor": "当前编辑器",
    "source.editor": "编辑器",
    "visibility.help": "如果看不到入口：请执行 Reload Window，并在命令面板搜索“优化提示词”。"
  },
  en: {
    "status.primary": "$(sparkle) Prompt Optimize",
    "status.primaryTooltip": "Optimize prompt",
    "status.modelsTooltip": "Quick model actions",
    "onboarding.message": "Prompt Optimizer is ready. You can optimize selected text, send results to a new editor, or copy them into Cursor Chat.",
    "onboarding.setup": "Setup Wizard",
    "onboarding.tryCursor": "Try Cursor Replace",
    "onboarding.readme": "Open README",
    "languageChange.message": "The UI language changed. Reload the window to refresh command titles and settings descriptions.",
    "languageChange.reload": "Reload Window",
    "picker.modelPlaceholder": "Select target model",
    "picker.outputPlaceholder": "Choose output mode",
    "picker.statusModelPlaceholder": "Select target model",
    "picker.mcpClientPlaceholder": "Select the MCP client",
    "picker.default": "Default",
    "picker.quickFill": "Quick fill",
    "warning.noPrompt": "No prompt text found. Select text, open a file, or enter text when prompted.",
    "warning.openFileAndSelect": "Open a file and select prompt text first.",
    "warning.selectPrompt": "Select prompt text to optimize directly.",
    "warning.selectionEmpty": "Selected text is empty.",
    "warning.noSourceAnywhere": "No source text found in selection, editor, or clipboard.",
    "warning.clipboardEmpty": "Clipboard is empty.",
    "warning.mcpPathUnavailable": "Unable to resolve the bundled MCP server path.",
    "hint.openNewEditor": "Open New Editor",
    "hint.setupWizard": "Setup Wizard",
    "message.autoOptimized": "Prompt Optimizer: selection auto-optimized",
    "message.setupDone": "Prompt Optimizer configured for {provider}.",
    "message.mcpConfigCopied": "The MCP config snippet was copied and opened in a new editor.",
    "mcp.previewReady": "Preview is ready and copied to the clipboard. Send it manually when ready.",
    "mcp.autosendActiveEditor": "The MCP auto-send flow pasted the optimized prompt into the active editor.",
    "mcp.autosendClipboard": "The MCP auto-send flow copied the optimized prompt. Forward it to the original chain.",
    "source.readme": "README",
    "source.cursorChat": "Cursor Chat",
    "source.clipboard": "clipboard",
    "source.activeEditor": "active editor",
    "source.editor": "editor",
    "visibility.help": "If you still do not see the entry points, reload the window and search for Optimize Prompt in the Command Palette."
  }
};

const MODEL_META: Record<TargetModel, { icon: string; zh: string; en: string }> = {
  chatgpt: { icon: "$(comment-discussion)", zh: "ChatGPT", en: "ChatGPT" },
  cursor: { icon: "$(edit-session)", zh: "Cursor", en: "Cursor" },
  codex: { icon: "$(code)", zh: "Codex", en: "Codex" },
  claude: { icon: "$(hubot)", zh: "Claude", en: "Claude" },
  gemini: { icon: "$(sparkle)", zh: "Gemini", en: "Gemini" },
  deepseek: { icon: "$(search-fuzzy)", zh: "DeepSeek", en: "DeepSeek" }
};

export function t(key: Key, vars?: Record<string, string>): string {
  const locale = getLocale();
  const template = TEXT[locale][key];
  return Object.entries(vars ?? {}).reduce(
    (value, [name, replacement]) => value.replaceAll(`{${name}}`, replacement),
    template
  );
}

export function getLocale(): Locale {
  return vscode.env.language.toLowerCase().startsWith("zh") ? "zh" : "en";
}

export function getModelLabel(targetModel: TargetModel): string {
  const meta = MODEL_META[targetModel];
  return getLocale() === "zh" ? meta.zh : meta.en;
}

export function getModelIcon(targetModel: TargetModel): string {
  return MODEL_META[targetModel].icon;
}
