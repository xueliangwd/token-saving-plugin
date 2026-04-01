# Prompt Optimizer

A lightweight VS Code extension that converts natural language prompts into shorter, clearer prompts for different AI tools.

Supported targets:

- ChatGPT
- Cursor
- Codex
- Claude
- Gemini
- DeepSeek

## Features

- Reads selected text or the full active editor
- Falls back to manual text input when no editor text is available
- Lets the user pick a target model with `QuickPick`
- Lets the user choose `replace`, `copy`, or `replace + copy`
- Parses the request with simple local rules
- Supports configurable model-based transformation through free local or hosted models
- Normalizes remote model output back into the selected target format
- Replaces the original text with a model-specific optimized prompt

## New interaction points

- Command palette: `Optimize Prompt`
- Command palette: `Prompt Optimizer: Setup Wizard`
- Editor right-click menu
- Status bar entry: `Prompt Optimizer`
- Shortcut:
  - macOS: `cmd+alt+p`
  - Windows/Linux: `ctrl+alt+p`

## Configurable transformation

You can keep using the built-in local parser, or switch to a model-based transformer in VS Code settings.

Key settings:

- `promptOptimizer.transformationEngine`: `local` or `remote`
- `promptOptimizer.outputLanguage`: `english` or `source`
- `promptOptimizer.remote.provider`: `ollama` or `openai-compatible`
- `promptOptimizer.remote.baseUrl`: endpoint base URL
- `promptOptimizer.remote.apiKey`: API key for hosted providers
- `promptOptimizer.remote.model`: model name
- `promptOptimizer.remote.temperature`
- `promptOptimizer.remote.timeoutMs`
- `promptOptimizer.remote.systemPrompt`
- `promptOptimizer.remote.fallbackToLocal`

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
