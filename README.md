# Prompt Optimizer

A lightweight VS Code extension that converts natural language prompts into shorter, clearer prompts for different AI tools.

Supported targets:

- ChatGPT
- Cursor
- Codex
- Claude
- Gemini
- DeepSeek

Supported workflows:

- VS Code / Cursor extension commands
- MCP server for Cursor and other MCP-capable IDEs

## Features

- Reads selected text or the full active editor
- Falls back to manual text input when no editor text is available
- Lets the user pick a target model with `QuickPick`
- Lets the user choose `replace`, `copy`, or `replace + copy`
- Parses the request with simple local rules
- Supports configurable model-based transformation through free local or hosted models
- Normalizes remote model output back into the selected target format
- Supports configurable common optimization rules with built-in and custom append rules
- Bundles an MCP server for interception-style optimize-then-forward workflows
- Replaces the original text with a model-specific optimized prompt

## New interaction points

- Command palette: `Optimize Prompt`
- Command palette: `Prompt Optimizer: Setup Wizard`
- Command palette: `Prompt Optimizer: Send To New Editor`
- Command palette: `Prompt Optimizer: Optimize Clipboard And Paste`
- Command palette: `Prompt Optimizer: Send To Cursor Chat`
- Command palette: `Prompt Optimizer: Quick Cursor Replace`
- Command palette: `Prompt Optimizer: Status Bar Models`
- Command palette: `Prompt Optimizer: Copy MCP Config`
- Command palette: `Prompt Optimizer: Open MCP Guide`
- Command palette: `Prompt Optimizer: MCP Intercept Preview`
- Command palette: `Prompt Optimizer: Quick Fill ChatGPT`
- Command palette: `Prompt Optimizer: Quick Fill Claude`
- Command palette: `Prompt Optimizer: Quick Fill Gemini`
- Command palette: `Prompt Optimizer: Quick Fill Codex`
- Command palette: `Prompt Optimizer: Quick Fill DeepSeek`
- Editor right-click menu
- Status bar entries:
  - `Prompt 优化`
  - model dropdown like `ChatGPT / Cursor / Claude / Gemini`
- Shortcut:
  - macOS: `cmd+alt+p`
  - Windows/Linux: `ctrl+alt+p`
  - New editor: `cmd+alt+o` / `ctrl+alt+o`
  - Cursor chat workflow: `cmd+alt+l` / `ctrl+alt+l`
  - Direct Cursor replace: `cmd+alt+r` / `ctrl+alt+r`

## First-run onboarding

After installation, the extension shows a first-run guide once.

Quick actions:

- `Setup Wizard`
- `Try Cursor Replace`
- `Open README`

## Lightweight paste hints

After copy-based actions, the extension shows a lightweight hint that tells you:

- the prompt is ready
- whether it was auto-pasted
- whether you should paste it into the target AI input box

The hint also gives quick actions:

- `Open New Editor / 打开新编辑器`
- `Setup Wizard / 设置向导`

You can disable this with:

- `promptOptimizer.onboarding.showOnStartup`

## Cursor usage

This extension works on editor text, not by directly rewriting what you type inside the Cursor chat input box.

That said, this repository now also includes an MCP server so Cursor or other IDEs can call a tool before the original send step.
The exact "intercept input box automatically" behavior depends on what the host IDE exposes through MCP or workflow configuration.

Use it in Cursor like this:

1. Put your raw prompt in a normal editor tab, or copy it to the clipboard.
2. Trigger one of these commands:
   - `Optimize Prompt`: choose model and output mode
   - click the model dropdown in the status bar: quickly choose `ChatGPT / Cursor / Claude / Gemini`
   - `Prompt Optimizer: Send To New Editor`: optimize and open result in a new tab
   - `Prompt Optimizer: Optimize Clipboard And Paste`: optimize clipboard text and paste into the active editor
   - `Prompt Optimizer: Send To Cursor Chat`: optimize as Cursor format, copy it, and try to focus chat
   - `Prompt Optimizer: Quick Cursor Replace`: directly replace the current selection with Cursor format
   - `Prompt Optimizer: Quick Fill ChatGPT / Claude / Gemini / Codex / DeepSeek`: optimize, copy, and paste into the active editor when possible
3. If chat focus does not open automatically in your Cursor build, paste the copied result into Cursor Chat or Composer manually.

For automatic selection replacement, enable:

- `promptOptimizer.selectionAutoOptimize.enabled`
- `promptOptimizer.selectionAutoOptimize.debounceMs`

## MCP workflow

The extension package includes a bundled MCP server:

`dist/mcpServer.js`

It is designed for this chain:

1. IDE captures the original prompt text
2. IDE calls the MCP tool `optimize_prompt`
3. Prompt Optimizer rewrites the prompt for the selected model
4. The IDE either:
   - shows a preview first and waits for manual send
   - or auto-forwards the optimized prompt to the original chain

Default behavior is preview-first, manual send.

### What MCP can and cannot do

- It can provide a standard tool that IDEs call before they send the prompt onward
- It can return structured data such as `optimizedPrompt`, `previewBeforeSend`, `autoSend`, and applied common rules
- It cannot force Cursor's private chat input box to be intercepted unless Cursor itself is configured to call the MCP tool in that step

### MCP tools

- `optimize_prompt`
  - input: original text, target model, preview/send mode, optional remote model settings, optional custom rules
  - output: optimized prompt, engine used, common rules used, preview/send hints
- `get_setup_snippet`
  - returns a ready-to-copy MCP configuration snippet

### Copy MCP config from the extension

Run:

- `Prompt Optimizer: Copy MCP Config`

Then choose:

- Cursor
- Claude Desktop
- Cline / Roo / Continue
- Generic MCP Client

The extension will:

- copy the JSON snippet to the clipboard
- open the snippet in a new editor

### Example Cursor MCP config

```json
{
  "mcpServers": {
    "prompt-optimizer": {
      "command": "node",
      "args": [
        "/ABSOLUTE/PATH/TO/token-saving-plugin/dist/mcpServer.js"
      ]
    }
  }
}
```

### Preview-first intercept simulation inside the extension

Run:

- `Prompt Optimizer: MCP Intercept Preview`

This command simulates the MCP workflow locally:

1. reads selection, editor text, or clipboard
2. optimizes with the configured MCP target model
3. opens a preview document
4. copies the optimized result
5. if configured, can auto-paste into the active editor

## Configurable transformation

You can keep using the built-in local parser, or switch to a model-based transformer in VS Code settings.

Key settings:

- `promptOptimizer.transformationEngine`: `local` or `remote`
- `promptOptimizer.outputLanguage`: `english` or `source`
- `promptOptimizer.defaultTargetModel`
- `promptOptimizer.remote.provider`: `ollama` or `openai-compatible`
- `promptOptimizer.remote.baseUrl`: endpoint base URL
- `promptOptimizer.remote.apiKey`: API key for hosted providers
- `promptOptimizer.remote.model`: model name
- `promptOptimizer.remote.temperature`
- `promptOptimizer.remote.timeoutMs`
- `promptOptimizer.remote.systemPrompt`
- `promptOptimizer.remote.fallbackToLocal`
- `promptOptimizer.clipboard.autoPasteToActiveEditor`
- `promptOptimizer.cursorChat.openAfterCopy`
- `promptOptimizer.selectionAutoOptimize.enabled`
- `promptOptimizer.selectionAutoOptimize.debounceMs`
- `promptOptimizer.onboarding.showOnStartup`
- `promptOptimizer.commonRules.enabled`
- `promptOptimizer.commonRules.appendBuiltIn`
- `promptOptimizer.commonRules.customRules`
- `promptOptimizer.mcp.defaultTargetModel`
- `promptOptimizer.mcp.previewBeforeSend`
- `promptOptimizer.mcp.autoSend`

### Common rule examples

Built-in rules cover:

- remove filler and keep the prompt compact
- preserve entities, APIs, and field names
- prefer explicit tasks, constraints, and deliverables
- avoid inventing business requirements
- keep the structure flat and easy to paste

Custom rules can be added in settings, for example:

```json
{
  "promptOptimizer.commonRules.customRules": [
    "prefer implementation-ready wording",
    "keep response under 120 tokens when possible",
    "preserve all business nouns exactly"
  ]
}
```

Recommended free usage patterns:

- Local free model: use `ollama` with a local instruct model and keep `apiKey` empty
- Hosted free-tier model: use `openai-compatible`, fill in your provider endpoint, API key, and available free model name

The remote path is provider-agnostic as long as it supports an OpenAI-compatible `chat/completions` API.

Setup wizard flow:

1. Run `Prompt Optimizer: Setup Wizard`
2. Choose `Ollama` or `OpenAI-Compatible`
3. Fill in base URL, model name, and API key when needed
4. Choose English output or keep source language

Example `settings.json` for a local free model:

```json
{
  "promptOptimizer.transformationEngine": "remote",
  "promptOptimizer.remote.provider": "ollama",
  "promptOptimizer.remote.baseUrl": "http://127.0.0.1:11434/v1",
  "promptOptimizer.remote.model": "qwen2.5:3b-instruct",
  "promptOptimizer.remote.apiKey": "",
  "promptOptimizer.remote.fallbackToLocal": true
}
```

Example `settings.json` for a hosted OpenAI-compatible free-tier endpoint:

```json
{
  "promptOptimizer.transformationEngine": "remote",
  "promptOptimizer.remote.provider": "openai-compatible",
  "promptOptimizer.remote.baseUrl": "https://your-provider.example/v1",
  "promptOptimizer.remote.model": "your-free-model",
  "promptOptimizer.remote.apiKey": "YOUR_API_KEY",
  "promptOptimizer.remote.fallbackToLocal": true
}
```

## Output styles

### ChatGPT

Readable and lightly structured:

```text
Create a Flutter login page.

Input:
- username
- password

Constraints:
- validate username and password

Output:
- dart code
- UI implementation
```

### Cursor

Concise developer-oriented bullets:

```text
build flutter login page
- username
- password
- validate username and password
- output: dart code, UI implementation
```

### Codex

Strict spec-like structure:

```text
TASK: build flutter login page
INPUT:
- username
- password
CONSTRAINTS:
- validate username and password
OUTPUT:
- dart code
- UI implementation
```

## Example

Input:

```text
帮我写一个带用户名密码校验的 Flutter 登录页面
```

Possible Codex output:

```text
TASK: build flutter login page
INPUT:
- username
- password
- flutter
CONSTRAINTS:
- validate username and password
OUTPUT:
- dart code
- UI implementation
```

## Development

Direct体验方式:

1. Open this folder in VS Code or Cursor.
2. Press `F5` to launch the Extension Development Host.
3. In the new window, run `Optimize Prompt`.
4. Select a model, then choose:
   - `Replace in editor`
   - `Copy to clipboard`
   - `Replace and copy`
5. Optional: open Settings and search `Prompt Optimizer` to switch from local rules to a configured free model

Package locally as a `.vsix`:

```bash
npm run package-vsix
```

If entry points are not visible after installation:

1. Install the latest generated `.vsix`
2. Run `Developer: Reload Window`
3. Open Command Palette and search:
   - `Optimize Prompt`
   - `Prompt Optimizer`
4. If the top toolbar buttons still do not show in your Cursor build, use the Command Palette or status bar entry first

This repo already includes runnable files in `dist/`, so the command can be experienced without first installing TypeScript locally.

Optional local smoke test:

```bash
npm run smoke-test
```

If you want to rebuild the TypeScript source later, install dependencies and build:

```bash
npm install
npm run build
```
