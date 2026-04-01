"use strict";

const assert = require("node:assert/strict");
const { parsePrompt } = require("../dist/promptProcessor");
const { formatPrompt } = require("../dist/modelAdapters");
const { normalizeOptimizedPrompt } = require("../dist/normalizer");

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

console.log("smoke-test passed");
