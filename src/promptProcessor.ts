import { ParsedPrompt } from "./types";

const FILLER_PATTERNS = [
  /\bplease\b/gi,
  /\bkindly\b/gi,
  /\bcan you\b/gi,
  /\bcould you\b/gi,
  /\bhelp me\b/gi,
  /\bi want you to\b/gi,
  /\bmake sure\b/gi,
  /\btry to\b/gi,
  /请帮我/gu,
  /麻烦你/gu,
  /帮我/gu,
  /请/gu
];

const EXPLICIT_SECTION_PATTERNS = [
  { label: "fields", type: "input" },
  { label: "inputs", type: "input" },
  { label: "input", type: "input" },
  { label: "requirements", type: "constraint" },
  { label: "constraints", type: "constraint" },
  { label: "constraint", type: "constraint" },
  { label: "validation", type: "constraint" },
  { label: "output", type: "output" },
  { label: "result", type: "output" },
  { label: "功能", type: "input" },
  { label: "输入", type: "input" },
  { label: "要求", type: "constraint" },
  { label: "约束", type: "constraint" },
  { label: "限制", type: "constraint" },
  { label: "输出", type: "output" }
] as const;

const CONSTRAINT_KEYWORDS = [
  "must",
  "should",
  "need to",
  "without",
  "using",
  "validation",
  "responsive",
  "lightweight",
  "local",
  "only",
  "must support"
];

const OUTPUT_HINTS: Array<{ pattern: RegExp; value: string }> = [
  { pattern: /\bflutter\b/i, value: "dart code" },
  { pattern: /\btypescript\b|\bts\b/i, value: "typescript code" },
  { pattern: /\bjavascript\b|\bjs\b/i, value: "javascript code" },
  { pattern: /\bpython\b/i, value: "python code" },
  { pattern: /\blogin page\b|\b登录页面\b/u, value: "UI implementation" },
  { pattern: /\bextension\b|插件/u, value: "extension code" },
  { pattern: /\bapi\b|接口/u, value: "API implementation" },
  { pattern: /\bcomponent\b|组件/u, value: "component code" }
];

const KNOWN_FIELDS: Array<{ pattern: RegExp; value: string }> = [
  { pattern: /username|user name|用户名/i, value: "username" },
  { pattern: /password|密码/i, value: "password" },
  { pattern: /email|邮箱/i, value: "email" },
  { pattern: /phone|手机号|mobile/i, value: "phone" },
  { pattern: /otp|验证码/i, value: "otp code" },
  { pattern: /token|令牌/i, value: "token" },
  { pattern: /search|搜索/i, value: "search" },
  { pattern: /filter|筛选/i, value: "filter" },
  { pattern: /table|表格/i, value: "table" },
  { pattern: /form|表单/i, value: "form" },
  { pattern: /flutter/i, value: "flutter" },
  { pattern: /react/i, value: "react" },
  { pattern: /vue/i, value: "vue" },
  { pattern: /vscode|vs code/i, value: "vscode extension" },
  { pattern: /cursor/i, value: "cursor" },
  { pattern: /chatgpt/i, value: "chatgpt" },
  { pattern: /codex/i, value: "codex" },
  { pattern: /claude/i, value: "claude" },
  { pattern: /gemini/i, value: "gemini" },
  { pattern: /deepseek/i, value: "deepseek" }
];

const TASK_HINTS: Array<{ pattern: RegExp; value: string }> = [
  { pattern: /flutter.*(登录页面|login page)|登录页面.*flutter/iu, value: "build flutter login page" },
  { pattern: /(vscode|vs code|cursor).*(extension|插件)|(extension|插件).*(vscode|vs code|cursor)/iu, value: "build vscode extension" },
  { pattern: /(prompt|提示词).*(optimize|optimizer|优化)|(optimize|optimizer|优化).*(prompt|提示词)/iu, value: "optimize prompt" },
  { pattern: /(api|接口).*(design|设计|build|实现)/iu, value: "design API" },
  { pattern: /(component|组件).*(build|实现|create)/iu, value: "build component" }
];

const COMMON_SKIP_WORDS = new Set([
  "a",
  "an",
  "the",
  "and",
  "or",
  "for",
  "of",
  "page",
  "screen",
  "with",
  "without",
  "validation",
  "create",
  "build",
  "write",
  "make",
  "generate",
  "need",
  "should",
  "must",
  "support",
  "use"
]);

export function parsePrompt(text: string): ParsedPrompt {
  const cleanedText = normalizeWhitespace(stripFillers(text));
  const rawSegments = splitSegments(cleanedText);
  const explicitItems = extractExplicitItems(cleanedText);
  const task = extractTask(cleanedText, rawSegments);
  const constraints = dedupeItems([
    ...extractConstraints(rawSegments),
    ...explicitItems.constraints
  ]);
  const input = dedupeItems([
    ...extractInputs(cleanedText, rawSegments, task, constraints),
    ...explicitItems.input
  ]).slice(0, 10);
  const output = dedupeItems([
    ...explicitItems.output,
    ...inferOutput(cleanedText, task)
  ]);

  return {
    task,
    input,
    constraints,
    output
  };
}

function stripFillers(text: string): string {
  return FILLER_PATTERNS.reduce((value, pattern) => value.replace(pattern, " "), text);
}

function normalizeWhitespace(text: string): string {
  return text.replace(/\r/g, "\n").replace(/[ \t]+/g, " ").replace(/\n+/g, "\n").trim();
}

function splitSegments(text: string): string[] {
  return text
    .split(/[\n,.!?;:，。！？；：]/u)
    .map((segment) => segment.trim())
    .filter(Boolean);
}

function extractTask(text: string, segments: string[]): string {
  for (const hint of TASK_HINTS) {
    if (hint.pattern.test(text)) {
      return hint.value;
    }
  }

  const explicitTask = extractTaskFromChinese(text);
  if (explicitTask) {
    return explicitTask;
  }

  const firstSegment = segments[0] ?? text;
  return normalizeTask(firstSegment || "handle the request");
}

function extractTaskFromChinese(text: string): string | undefined {
  const translated = translateCommonChinese(text).toLowerCase();
  if (translated.includes("login page") && translated.includes("flutter")) {
    return "build flutter login page";
  }
  if (translated.includes("plugin") || translated.includes("extension")) {
    return "build vscode extension";
  }
  return undefined;
}

function normalizeTask(segment: string): string {
  let value = translateCommonChinese(segment.trim());
  value = value.replace(/^(to\s+)/i, "");
  value = value.replace(/^(write|create|build|generate|make|implement|design)\b/i, (match) => match.toLowerCase());
  value = value.replace(/\bneed(s)?\s+to\b/gi, "");
  value = value.replace(/\s+/g, " ").trim();

  if (/login page/i.test(value) && !/\bflutter\b/i.test(value) && /flutter/i.test(segment)) {
    value = `build flutter ${value}`;
  }

  return value ? value.toLowerCase() : "handle the request";
}

function extractConstraints(segments: string[]): string[] {
  const values = new Set<string>();

  for (const segment of segments) {
    const normalized = translateCommonChinese(segment.trim());
    if (!normalized) {
      continue;
    }

    const lower = normalized.toLowerCase();
    if (CONSTRAINT_KEYWORDS.some((keyword) => lower.includes(keyword))) {
      values.add(toEnglishConstraint(normalized));
    }

    if (/校验|验证/u.test(segment)) {
      if (/(用户名|username)/iu.test(segment) && /(密码|password)/iu.test(segment)) {
        values.add("validate username and password");
      } else {
        values.add("add validation");
      }
    }

    if (/非空|non[- ]?empty/i.test(segment)) {
      values.add("non-empty validation");
    }

    if (/响应式|responsive/u.test(segment)) {
      values.add("responsive layout");
    }

    if (/本地处理|local/u.test(segment)) {
      values.add("local processing only");
    }

    if (/轻量|lightweight/u.test(segment)) {
      values.add("lightweight implementation");
    }

    if (/不要|不使用|without/u.test(segment) && /(ai|dependency|依赖)/iu.test(segment)) {
      values.add("avoid heavy AI dependencies");
    }
  }

  return Array.from(values);
}

function extractInputs(
  text: string,
  segments: string[],
  task: string,
  constraints: string[]
): string[] {
  const values = new Set<string>();
  const taskWords = new Set(task.toLowerCase().split(/\s+/));
  const constraintWords = new Set(constraints.flatMap((item) => item.toLowerCase().split(/[\s-]+/)));

  for (const knownField of inferKnownFields(text)) {
    values.add(knownField);
  }

  for (const segment of segments) {
    const translated = translateCommonChinese(segment);
    const englishBits = translated.match(/\b[a-zA-Z][a-zA-Z0-9+._-]*\b/g) ?? [];
    for (const bit of englishBits) {
      const lower = bit.toLowerCase();
      if (taskWords.has(lower) || constraintWords.has(lower) || COMMON_SKIP_WORDS.has(lower)) {
        continue;
      }
      values.add(lower);
    }
  }

  return Array.from(values).slice(0, 8);
}

function inferKnownFields(text: string): string[] {
  const values: string[] = [];

  for (const item of KNOWN_FIELDS) {
    if (item.pattern.test(text)) {
      values.push(item.value);
    }
  }

  return values;
}

function inferOutput(text: string, task: string): string[] {
  const values = new Set<string>();

  for (const hint of OUTPUT_HINTS) {
    if (hint.pattern.test(text) || hint.pattern.test(task)) {
      values.add(hint.value);
    }
  }

  if (/\bprompt\b|提示词/u.test(text)) {
    values.add("optimized prompt");
  }

  if (values.size === 0) {
    values.add("implementation");
  }

  return Array.from(values);
}

function extractExplicitItems(text: string): {
  input: string[];
  constraints: string[];
  output: string[];
} {
  const result = {
    input: [] as string[],
    constraints: [] as string[],
    output: [] as string[]
  };

  for (const section of EXPLICIT_SECTION_PATTERNS) {
    const pattern = new RegExp(`${section.label}\\s*[:：]\\s*([^\\n]+)`, "giu");
    const matches = Array.from(text.matchAll(pattern));
    for (const match of matches) {
      const items = splitList(match[1] ?? "");
      if (section.type === "input") {
        result.input.push(...items);
      } else if (section.type === "constraint") {
        result.constraints.push(...items);
      } else {
        result.output.push(...items);
      }
    }
  }

  return {
    input: dedupeItems(result.input),
    constraints: dedupeItems(result.constraints),
    output: dedupeItems(result.output)
  };
}

function splitList(value: string): string[] {
  return value
    .split(/[|,/，、]/u)
    .map((item) => translateCommonChinese(item).trim().toLowerCase())
    .filter(Boolean);
}

function dedupeItems(items: string[]): string[] {
  return Array.from(new Set(items.map((item) => item.trim()).filter(Boolean)));
}

function toEnglishConstraint(segment: string): string {
  const translated = translateCommonChinese(segment)
    .replace(/\bwith\b/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

  if (/username/i.test(translated) && /password/i.test(translated) && /validation/i.test(translated)) {
    return "validate username and password";
  }

  return translated;
}

function translateCommonChinese(value: string): string {
  return value
    .replace(/登录页面/gu, "login page")
    .replace(/登录/gu, "login")
    .replace(/用户名/gu, "username")
    .replace(/密码/gu, "password")
    .replace(/验证码/gu, "otp code")
    .replace(/邮箱/gu, "email")
    .replace(/手机号/gu, "phone")
    .replace(/校验|验证/gu, "validation")
    .replace(/约束|限制/gu, "constraints")
    .replace(/输出/gu, "output")
    .replace(/输入/gu, "input")
    .replace(/功能/gu, "features")
    .replace(/组件/gu, "component")
    .replace(/插件/gu, "plugin")
    .replace(/接口/gu, "api")
    .replace(/页面/gu, "page")
    .replace(/表单/gu, "form")
    .replace(/表格/gu, "table")
    .replace(/列表/gu, "list")
    .replace(/搜索/gu, "search")
    .replace(/筛选/gu, "filter")
    .replace(/带/gu, "with ")
    .replace(/支持/gu, "support")
    .replace(/响应式/gu, "responsive")
    .replace(/轻量/gu, "lightweight")
    .replace(/本地处理/gu, "local processing")
    .replace(/\s+/g, " ")
    .trim();
}
