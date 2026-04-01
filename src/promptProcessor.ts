import { ParsedPrompt } from "./types";

const FILLER_PATTERNS = [
  /\bplease\b/gi,
  /\bkindly\b/gi,
  /\bcan you\b/gi,
  /\bcould you\b/gi,
  /\bhelp me\b/gi,
  /\bi want you to\b/gi,
  /请帮我/gu,
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
  { label: "result", type: "output" }
] as const;

const CONSTRAINT_KEYWORDS = [
  "must",
  "should",
  "need to",
  "without",
  "with",
  "using",
  "validation",
  "responsive",
  "lightweight",
  "local",
  "only"
];

const OUTPUT_HINTS: Array<{ pattern: RegExp; value: string }> = [
  { pattern: /\bflutter\b/i, value: "dart code" },
  { pattern: /\btypescript\b|\bts\b/i, value: "typescript code" },
  { pattern: /\bjavascript\b|\bjs\b/i, value: "javascript code" },
  { pattern: /\bpython\b/i, value: "python code" },
  { pattern: /\blogin page\b|\b登录页面\b/u, value: "UI implementation" },
  { pattern: /\bextension\b/i, value: "extension code" }
];

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
  ]).slice(0, 8);
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
  const lower = text.toLowerCase();

  if (/flutter/i.test(text) && /登录页面|login page/u.test(text)) {
    return "build flutter login page";
  }

  if (/(vscode|vs code|cursor)/i.test(text) && /extension/i.test(lower)) {
    return "build vscode extension";
  }

  if (/prompt/i.test(text) && /(optimize|optimizer|优化)/i.test(text)) {
    return "optimize prompt";
  }

  const firstSegment = segments[0] ?? text;
  return normalizeTask(firstSegment || "handle the request");
}

function normalizeTask(segment: string): string {
  let value = segment.trim();
  value = value.replace(/^(to\s+)/i, "");
  value = value.replace(/^(write|create|build|generate|make)\b/i, (match) => match.toLowerCase());
  value = translateCommonChinese(value);

  if (/登录页面/u.test(value) && !/\bflutter\b/i.test(value)) {
    value = `build flutter ${value}`;
  }

  if (/[A-Z]/.test(value)) {
    return value;
  }

  return value.toLowerCase();
}

function extractConstraints(segments: string[]): string[] {
  const values = new Set<string>();

  for (const segment of segments) {
    const normalized = segment.trim();
    if (!normalized) {
      continue;
    }

    const lower = normalized.toLowerCase();
    if (CONSTRAINT_KEYWORDS.some((keyword) => lower.includes(keyword))) {
      values.add(toEnglishConstraint(normalized));
    }

    if (/校验/u.test(normalized)) {
      if (/用户名/u.test(normalized) && /密码/u.test(normalized)) {
        values.add("validate username and password");
      } else {
        values.add("add validation");
      }
    }

    if (/非空|non[- ]?empty/i.test(normalized)) {
      values.add("non-empty validation");
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
  const constraintWords = new Set(
    constraints.flatMap((item) => item.toLowerCase().split(/[\s-]+/))
  );

  for (const knownField of inferKnownFields(text)) {
    values.add(knownField);
  }

  for (const segment of segments) {
    const englishBits = segment.match(/\b[a-zA-Z][a-zA-Z0-9_-]*\b/g) ?? [];
    for (const bit of englishBits) {
      const lower = bit.toLowerCase();
      if (taskWords.has(lower) || constraintWords.has(lower)) {
        continue;
      }
      if (COMMON_SKIP_WORDS.has(lower)) {
        continue;
      }
      values.add(lower);
    }
  }

  return Array.from(values).slice(0, 6);
}

function inferKnownFields(text: string): string[] {
  const values: string[] = [];
  const lower = text.toLowerCase();

  if (/username|user name|用户名/i.test(text)) {
    values.push("username");
  }

  if (/password|密码/i.test(text)) {
    values.push("password");
  }

  if (/email|邮箱/i.test(text)) {
    values.push("email");
  }

  if (/flutter/i.test(text)) {
    values.push("flutter");
  }

  if (/vscode|vs code/i.test(text)) {
    values.push("vscode extension");
  }

  if (/chatgpt|cursor|codex/i.test(lower)) {
    const models = Array.from(new Set(lower.match(/\b(chatgpt|cursor|codex)\b/g) ?? []));
    values.push(...models);
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

  if (values.size === 0) {
    values.add("optimized prompt");
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
    const pattern = new RegExp(`${section.label}\\s*[:：]\\s*([^\\n]+)`, "gi");
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
  if (/校验/u.test(segment)) {
    if (/用户名/u.test(segment) && /密码/u.test(segment)) {
      return "validate username and password";
    }
    return "add validation";
  }

  return segment
    .trim()
    .replace(/\bwith\b/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function translateCommonChinese(value: string): string {
  return value
    .replace(/登录页面/gu, "login page")
    .replace(/登录/gu, "login")
    .replace(/用户名/gu, "username")
    .replace(/密码/gu, "password")
    .replace(/校验/gu, "validation")
    .replace(/带/gu, "with ")
    .replace(/\s+/g, " ")
    .trim();
}

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
  "generate"
]);
