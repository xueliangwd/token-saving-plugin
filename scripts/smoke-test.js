"use strict";

const assert = require("node:assert/strict");
const { parsePrompt } = require("../dist/promptProcessor");
const { formatPrompt } = require("../dist/modelAdapters");
const { normalizeOptimizedPrompt } = require("../dist/normalizer");
const { optimizePromptWithSettings } = require("../dist/optimizerCore");
const { buildMcpConfigSnippet } = require("../dist/mcpSupport");

const chineseInput = "帮我写一个带用户名密码校验的 Flutter 登录页面";
const parsedChinese = parsePrompt(chineseInput);

assert.equal(parsedChinese.task, "build flutter login page");
assert.ok(parsedChinese.input.includes("username"));
assert.ok(parsedChinese.input.includes("password"));
assert.ok(parsedChinese.constraints.includes("validate username and password"));

const codexOutput = formatPrompt(parsedChinese, "codex");
assert.ok(codexOutput.includes("TASK: build flutter login page"));
assert.ok(codexOutput.includes("INPUT:"));
assert.ok(codexOutput.includes("CONSTRAINTS:"));
assert.ok(codexOutput.includes("OUTPUT:"));

const englishInput = [
  "Create a Flutter login page.",
  "Fields: username, password.",
  "Validation: non-empty.",
  "Output: dart code."
].join(" ");
const parsedEnglish = parsePrompt(englishInput);

assert.equal(parsedEnglish.task, "build flutter login page");
assert.ok(parsedEnglish.input.includes("username"));
assert.ok(parsedEnglish.input.includes("password"));
assert.ok(parsedEnglish.constraints.includes("non-empty validation"));

const cursorOutput = formatPrompt(parsedEnglish, "cursor");
assert.ok(cursorOutput.startsWith("build flutter login page"));
assert.ok(cursorOutput.includes("- username"));
assert.ok(cursorOutput.includes("- output:"));

const complexChinese = [
  "帮我做一个 VSCode 插件。",
  "功能：选中文本优化提示词，支持 ChatGPT、Claude、Gemini。",
  "要求：本地处理优先，支持复制到剪贴板，响应式，轻量，不要重依赖。",
  "输出：typescript code"
].join(" ");
const parsedComplex = parsePrompt(complexChinese);
assert.equal(parsedComplex.task, "build vscode extension");
assert.ok(parsedComplex.input.includes("vscode extension"));
assert.ok(parsedComplex.input.includes("chatgpt"));
assert.ok(parsedComplex.input.includes("claude"));
assert.ok(parsedComplex.constraints.includes("local processing only"));
assert.ok(parsedComplex.constraints.includes("lightweight implementation"));

const claudeOutput = formatPrompt(parsedComplex, "claude");
assert.ok(claudeOutput.includes("Context:"));
assert.ok(claudeOutput.includes("Requirements:"));

const normalized = normalizeOptimizedPrompt(
  complexChinese,
  "TASK: build vscode extension\nINPUT:\n- selected text\n- chatgpt\nCONSTRAINTS:\n- lightweight\nOUTPUT:\n- typescript code",
  "codex"
);
assert.ok(normalized.includes("TASK: build vscode extension"));
assert.ok(normalized.includes("INPUT:"));
assert.ok(normalized.includes("CONSTRAINTS:"));

(async () => {
  const mcpSource = "使用 mcp 拦截 cursor 输入内容，先优化，再预览后手动发送，支持自动发送配置";
  const optimized = await optimizePromptWithSettings(mcpSource, "cursor", {
    transformationEngine: "local",
    outputLanguage: "english",
    commonRules: {
      enabled: true,
      appendBuiltIn: true,
      customRules: ["keep wording implementation-ready"]
    },
    remote: {
      provider: "ollama",
      baseUrl: "http://127.0.0.1:11434/v1",
      apiKey: "",
      model: "qwen2.5:3b-instruct",
      temperature: 0.2,
      timeoutMs: 30000,
      systemPrompt: "",
      fallbackToLocal: true
    }
  });

  assert.ok(optimized.optimizedPrompt.includes("mcp"));
  assert.ok(optimized.appliedCommonRules.includes("keep wording implementation-ready"));
  assert.ok(!optimized.optimizedPrompt.includes("keep the prompt compact and remove filler"));

  const mcpListInput = [
    "能否增加一种 mcp 的方式",
    "- cursor",
    "- mcp",
    "- ide",
    "- input",
    "- output: implementation"
  ].join("\n");
  const parsedMcpList = parsePrompt(mcpListInput);
  assert.equal(parsedMcpList.task, "能否增加一种 mcp 的方式");
  assert.deepEqual(parsedMcpList.input, ["cursor", "mcp", "ide", "input"]);
  assert.deepEqual(parsedMcpList.output, ["implementation"]);
  assert.equal(parsedMcpList.constraints.length, 0);

  const snippet = buildMcpConfigSnippet("cursor", "/tmp/token-saving-plugin/dist/mcpServer.js");
  assert.ok(snippet.includes("\"mcpServers\""));
  assert.ok(snippet.includes("mcpServer.js"));

  console.log("smoke-test passed");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
