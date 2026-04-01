"use strict";

const assert = require("node:assert/strict");
const { parsePrompt } = require("../dist/promptProcessor");
const { formatPrompt } = require("../dist/modelAdapters");

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

console.log("smoke-test passed");
