"use strict";

const assert = require("node:assert/strict");
const { parsePrompt } = require("../dist/promptProcessor");
const { formatPrompt } = require("../dist/modelAdapters");
const { optimizePromptWithSettings } = require("../dist/optimizerCore");

const localSettings = {
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
};

const cases = [
  {
    name: "Chinese login page",
    input: "帮我写一个带用户名密码校验的 Flutter 登录页面",
    expected: {
      task: "build flutter login page",
      inputIncludes: ["username", "password", "flutter"],
      constraintsIncludes: ["validate username and password"],
      outputIncludes: ["dart code", "UI implementation"]
    }
  },
  {
    name: "English fields and validation",
    input: "Create a Flutter login page. Fields: username, password. Validation: non-empty. Output: dart code.",
    expected: {
      task: "build flutter login page",
      inputIncludes: ["username", "password"],
      constraintsIncludes: ["non-empty validation"],
      outputIncludes: ["dart code"]
    }
  },
  {
    name: "Plugin feature block",
    input: [
      "帮我做一个 VSCode 插件。",
      "功能：选中文本优化提示词，支持 ChatGPT、Claude、Gemini。",
      "要求：本地处理优先，支持复制到剪贴板，响应式，轻量，不要重依赖。",
      "输出：typescript code"
    ].join("\n"),
    expected: {
      task: "build vscode extension",
      inputIncludes: ["chatgpt", "claude", "gemini"],
      constraintsIncludes: ["local processing only", "responsive layout", "lightweight implementation", "avoid heavy AI dependencies"],
      outputIncludes: ["typescript code"]
    }
  },
  {
    name: "MCP list stays intact",
    input: [
      "能否增加一种 mcp 的方式",
      "- cursor",
      "- mcp",
      "- ide",
      "- input",
      "- output: implementation"
    ].join("\n"),
    expected: {
      task: "能否增加一种 mcp 的方式",
      inputExact: ["cursor", "mcp", "ide", "input"],
      constraintsExact: [],
      outputExact: ["implementation"]
    }
  },
  {
    name: "Explicit input constraint output sections",
    input: [
      "Build an API gateway.",
      "Input: auth token, request body",
      "Constraints: lightweight, local processing",
      "Output: typescript code"
    ].join("\n"),
    expected: {
      task: "build an api gateway.",
      inputIncludes: ["auth token", "request body", "token"],
      constraintsIncludes: ["lightweight", "local processing"],
      outputIncludes: ["typescript code"]
    }
  },
  {
    name: "Chinese explicit sections",
    input: [
      "设计一个登录接口",
      "输入：用户名、密码",
      "要求：非空校验",
      "输出：API implementation"
    ].join("\n"),
    expected: {
      task: "design API",
      inputIncludes: ["username", "password"],
      constraintsIncludes: ["non-empty validation"],
      outputIncludes: ["API implementation"]
    }
  },
  {
    name: "Prompt optimization request",
    input: "优化这段提示词，保留 API 字段，不要发明业务规则，输出优化后的 prompt",
    expected: {
      task: "optimize prompt",
      outputIncludes: ["optimized prompt"]
    }
  },
  {
    name: "Component build request",
    input: "实现一个带搜索和筛选的 React 组件",
    expected: {
      task: "build component",
      inputIncludes: ["react", "search", "filter"],
      outputIncludes: ["component code"]
    }
  },
  {
    name: "API design request",
    input: "帮我设计一个用户登录接口，返回 token",
    expected: {
      task: "design API",
      inputIncludes: ["token"],
      outputIncludes: ["API implementation"]
    }
  },
  {
    name: "Manual send after preview",
    input: "使用 mcp 拦截输入内容，先预览，再手动发送",
    expected: {
      constraintsIncludes: ["intercept source prompt before downstream send", "show transformed prompt before sending", "allow manual send after preview", "support MCP workflow"]
    }
  },
  {
    name: "Optional auto send",
    input: "支持预览后手动发送，也支持自动发送配置",
    expected: {
      constraintsIncludes: ["show transformed prompt before sending", "allow manual send after preview", "support optional auto send"]
    }
  },
  {
    name: "Local and lightweight",
    input: "要求本地处理，轻量，不要 AI 重依赖",
    expected: {
      constraintsIncludes: ["local processing only", "lightweight implementation", "avoid heavy AI dependencies"]
    }
  },
  {
    name: "Cursor plugin wording",
    input: "做一个 Cursor 插件，把原始输入先优化再发出去",
    expected: {
      task: "build vscode extension",
      inputIncludes: ["cursor", "plugin"]
    }
  },
  {
    name: "Mixed Chinese and English list",
    input: [
      "做一个 prompt optimizer",
      "- ChatGPT",
      "- Claude",
      "- Gemini",
      "- output: optimized prompt"
    ].join("\n"),
    expected: {
      task: "optimize prompt",
      inputIncludes: ["chatgpt", "claude", "gemini"],
      outputIncludes: ["optimized prompt"]
    }
  },
  {
    name: "Email and phone fields",
    input: "Create a registration form with email, phone, otp and password.",
    expected: {
      inputIncludes: ["email", "phone", "otp code", "password"]
    }
  },
  {
    name: "Context line preserved",
    input: [
      "Refine this request",
      "Context: mcp bridge, cursor, ide",
      "Output: implementation"
    ].join("\n"),
    expected: {
      task: "refine this request",
      inputIncludes: ["mcp bridge", "cursor", "ide"],
      outputIncludes: ["implementation"]
    }
  },
  {
    name: "Result label",
    input: "Build a Python script. Result: python code",
    expected: {
      outputIncludes: ["python code"]
    }
  },
  {
    name: "Deliverable label",
    input: "Write a plugin. Deliverable: extension code",
    expected: {
      task: "build vscode extension",
      outputIncludes: ["extension code"]
    }
  },
  {
    name: "Rules label",
    input: "Build a page. Rules: responsive, lightweight",
    expected: {
      constraintsIncludes: ["responsive", "lightweight", "responsive layout", "lightweight implementation"]
    }
  },
  {
    name: "No common rules in final output",
    input: "能否增加一种 mcp 的方式\n- cursor\n- output: implementation",
    expected: {
      optimizedExcludes: ["keep the prompt compact and remove filler", "do not invent missing business requirements"],
      optimizedIncludes: ["能否增加一种 mcp 的方式", "- cursor", "- output: implementation"]
    }
  }
];

function assertIncludesAll(actualValues, expectedValues, label) {
  for (const value of expectedValues ?? []) {
    assert.ok(actualValues.includes(value), `${label} should include "${value}", got ${JSON.stringify(actualValues)}`);
  }
}

function assertExact(actualValues, expectedValues, label) {
  if (!expectedValues) {
    return;
  }

  assert.deepEqual(actualValues, expectedValues, `${label} mismatch`);
}

(async () => {
  for (const testCase of cases) {
    const parsed = parsePrompt(testCase.input);
    const expected = testCase.expected;

    if (expected.task) {
      assert.equal(parsed.task, expected.task, `${testCase.name}: task mismatch`);
    }

    assertIncludesAll(parsed.input, expected.inputIncludes, `${testCase.name}: input`);
    assertIncludesAll(parsed.constraints, expected.constraintsIncludes, `${testCase.name}: constraints`);
    assertIncludesAll(parsed.output, expected.outputIncludes, `${testCase.name}: output`);
    assertExact(parsed.input, expected.inputExact, `${testCase.name}: input`);
    assertExact(parsed.constraints, expected.constraintsExact, `${testCase.name}: constraints`);
    assertExact(parsed.output, expected.outputExact, `${testCase.name}: output`);

    const cursorFormat = formatPrompt(parsed, "cursor");
    assert.ok(typeof cursorFormat === "string" && cursorFormat.length > 0, `${testCase.name}: cursor format should not be empty`);

    if (expected.optimizedIncludes || expected.optimizedExcludes) {
      const result = await optimizePromptWithSettings(testCase.input, "cursor", localSettings);
      for (const value of expected.optimizedIncludes ?? []) {
        assert.ok(result.optimizedPrompt.includes(value), `${testCase.name}: optimized output should include "${value}"`);
      }
      for (const value of expected.optimizedExcludes ?? []) {
        assert.ok(!result.optimizedPrompt.includes(value), `${testCase.name}: optimized output should exclude "${value}"`);
      }
    }
  }

  console.log(`unit-test passed (${cases.length} cases)`);
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
