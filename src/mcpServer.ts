import { optimizePromptWithSettings } from "./optimizerCore";
import { McpClient, OptimizationSettings, OutputLanguage, RemoteProvider, TargetModel, TransformationEngine } from "./types";

type JsonRpcId = number | string | null;

const TOOL_OPTIMIZE = "optimize_prompt";
const TOOL_SETUP = "get_setup_snippet";

const bufferState = {
  raw: ""
};

process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  bufferState.raw += chunk;
  consumeMessages().catch((error) => {
    writeLog(`Failed to consume MCP message: ${error instanceof Error ? error.message : String(error)}`);
  });
});

process.stdin.on("end", () => {
  process.exit(0);
});

async function consumeMessages(): Promise<void> {
  while (true) {
    const message = readFramedMessage();
    if (!message) {
      return;
    }

    await handleMessage(message);
  }
}

function readFramedMessage(): unknown | undefined {
  const separator = bufferState.raw.indexOf("\r\n\r\n");
  if (separator < 0) {
    return undefined;
  }

  const headerBlock = bufferState.raw.slice(0, separator);
  const lengthMatch = headerBlock.match(/Content-Length:\s*(\d+)/i);
  if (!lengthMatch) {
    throw new Error("Missing Content-Length header.");
  }

  const contentLength = Number.parseInt(lengthMatch[1], 10);
  const bodyStart = separator + 4;
  const bodyEnd = bodyStart + contentLength;
  if (bufferState.raw.length < bodyEnd) {
    return undefined;
  }

  const body = bufferState.raw.slice(bodyStart, bodyEnd);
  bufferState.raw = bufferState.raw.slice(bodyEnd);
  return JSON.parse(body);
}

async function handleMessage(message: any): Promise<void> {
  if (message.method === "notifications/initialized") {
    return;
  }

  if (message.method === "initialize") {
    sendResponse(message.id, {
      protocolVersion: "2024-11-05",
      capabilities: {
        tools: {}
      },
      serverInfo: {
        name: "prompt-optimizer",
        version: "0.1.0"
      }
    });
    return;
  }

  if (message.method === "tools/list") {
    sendResponse(message.id, {
      tools: [
        {
          name: TOOL_OPTIMIZE,
          description:
            "Optimize intercepted prompt text for ChatGPT, Cursor, Codex, Claude, Gemini, or DeepSeek before it continues in the original IDE chain.",
          inputSchema: {
            type: "object",
            properties: {
              text: { type: "string", description: "Original prompt text captured from the IDE input box." },
              targetModel: {
                type: "string",
                enum: ["chatgpt", "cursor", "codex", "claude", "gemini", "deepseek"],
                default: "cursor"
              },
              transformationEngine: {
                type: "string",
                enum: ["local", "remote"],
                default: "local"
              },
              outputLanguage: {
                type: "string",
                enum: ["english", "source"],
                default: "english"
              },
              previewBeforeSend: {
                type: "boolean",
                default: true,
                description: "When true, the client should show the transformed prompt first and wait for manual send."
              },
              autoSend: {
                type: "boolean",
                default: false,
                description: "When true, the client may forward the optimized prompt without manual confirmation."
              },
              includeCommonRules: {
                type: "boolean",
                default: true
              },
              customRules: {
                type: "array",
                items: { type: "string" },
                default: []
              },
              remote: {
                type: "object",
                properties: {
                  provider: { type: "string", enum: ["ollama", "openai-compatible"], default: "ollama" },
                  baseUrl: { type: "string" },
                  apiKey: { type: "string" },
                  model: { type: "string" },
                  temperature: { type: "number" },
                  timeoutMs: { type: "number" },
                  systemPrompt: { type: "string" },
                  fallbackToLocal: { type: "boolean" }
                }
              }
            },
            required: ["text"]
          }
        },
        {
          name: TOOL_SETUP,
          description: "Return a ready-to-copy MCP settings snippet for Cursor, Claude Desktop, Cline, or a generic IDE.",
          inputSchema: {
            type: "object",
            properties: {
              client: {
                type: "string",
                enum: ["cursor", "cline", "claude-desktop", "generic"],
                default: "cursor"
              }
            }
          }
        }
      ]
    });
    return;
  }

  if (message.method === "tools/call") {
    const toolName = message.params?.name;
    const argumentsObject = message.params?.arguments ?? {};

    if (toolName === TOOL_OPTIMIZE) {
      const result = await runOptimizeTool(argumentsObject);
      sendResponse(message.id, {
        content: [
          {
            type: "text",
            text: result.previewText
          }
        ],
        structuredContent: result
      });
      return;
    }

    if (toolName === TOOL_SETUP) {
      const result = runSetupTool(argumentsObject);
      sendResponse(message.id, {
        content: [{ type: "text", text: result.snippet }],
        structuredContent: result
      });
      return;
    }

    sendError(message.id, -32601, `Unknown tool: ${String(toolName)}`);
    return;
  }

  if (message.id !== undefined) {
    sendError(message.id, -32601, `Unsupported method: ${String(message.method)}`);
  }
}

async function runOptimizeTool(args: any): Promise<Record<string, unknown>> {
  const text = String(args?.text ?? "").trim();
  if (!text) {
    throw new Error("text is required");
  }

  const targetModel = asTargetModel(args?.targetModel);
  const previewBeforeSend = args?.previewBeforeSend !== false;
  const autoSend = args?.autoSend === true;
  const includeCommonRules = args?.includeCommonRules !== false;
  const settings: OptimizationSettings = {
    transformationEngine: asEngine(args?.transformationEngine),
    outputLanguage: asOutputLanguage(args?.outputLanguage),
    commonRules: {
      enabled: includeCommonRules,
      appendBuiltIn: true,
      customRules: asStringArray(args?.customRules)
    },
    remote: {
      provider: asProvider(args?.remote?.provider),
      baseUrl: String(args?.remote?.baseUrl ?? "http://127.0.0.1:11434/v1"),
      apiKey: String(args?.remote?.apiKey ?? ""),
      model: String(args?.remote?.model ?? "qwen2.5:3b-instruct"),
      temperature: clampNumber(args?.remote?.temperature, 0.2, 0, 1),
      timeoutMs: Math.max(toInt(args?.remote?.timeoutMs, 30000), 1000),
      systemPrompt: String(args?.remote?.systemPrompt ?? ""),
      fallbackToLocal: args?.remote?.fallbackToLocal !== false
    }
  };

  const result = await optimizePromptWithSettings(text, targetModel, settings);

  return {
    originalPrompt: text,
    optimizedPrompt: result.optimizedPrompt,
    targetModel,
    previewBeforeSend,
    autoSend,
    sendMode: previewBeforeSend ? "preview" : autoSend ? "autoSend" : "manual",
    engineUsed: result.engineUsed,
    normalizedFromRemote: result.normalizedFromRemote,
    appliedCommonRules: result.appliedCommonRules,
    previewText: [
      `Optimized prompt for ${targetModel}`,
      "",
      result.optimizedPrompt,
      "",
      `previewBeforeSend=${String(previewBeforeSend)}`,
      `autoSend=${String(autoSend)}`
    ].join("\n")
  };
}

function runSetupTool(args: any): Record<string, unknown> {
  const client = asClient(args?.client);
  const scriptPath = process.argv[1];
  const payload = {
    mcpServers: {
      "prompt-optimizer": {
        command: "node",
        args: [scriptPath]
      }
    }
  };

  return {
    client,
    scriptPath,
    snippet: JSON.stringify(payload, null, 2)
  };
}

function sendResponse(id: JsonRpcId, result: unknown): void {
  writeMessage({
    jsonrpc: "2.0",
    id,
    result
  });
}

function sendError(id: JsonRpcId, code: number, message: string): void {
  writeMessage({
    jsonrpc: "2.0",
    id,
    error: { code, message }
  });
}

function writeMessage(payload: unknown): void {
  const body = JSON.stringify(payload);
  process.stdout.write(`Content-Length: ${Buffer.byteLength(body, "utf8")}\r\n\r\n${body}`);
}

function writeLog(message: string): void {
  process.stderr.write(`[prompt-optimizer-mcp] ${message}\n`);
}

function asTargetModel(value: unknown): TargetModel {
  const allowed: TargetModel[] = ["chatgpt", "cursor", "codex", "claude", "gemini", "deepseek"];
  return allowed.includes(value as TargetModel) ? (value as TargetModel) : "cursor";
}

function asEngine(value: unknown): TransformationEngine {
  return value === "remote" ? "remote" : "local";
}

function asOutputLanguage(value: unknown): OutputLanguage {
  return value === "source" ? "source" : "english";
}

function asProvider(value: unknown): RemoteProvider {
  return value === "openai-compatible" ? "openai-compatible" : "ollama";
}

function asClient(value: unknown): McpClient {
  switch (value) {
    case "cursor":
    case "cline":
    case "claude-desktop":
    case "generic":
      return value;
    default:
      return "cursor";
  }
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((item) => String(item).trim()).filter(Boolean);
}

function toInt(value: unknown, fallback: number): number {
  const parsed = Number.parseInt(String(value ?? fallback), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clampNumber(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = Number.parseFloat(String(value ?? fallback));
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.min(Math.max(parsed, min), max);
}
