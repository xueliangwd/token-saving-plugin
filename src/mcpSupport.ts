import * as path from "node:path";
import { McpClient, TargetModel } from "./types";

export function buildMcpConfigSnippet(client: McpClient, serverScriptPath: string): string {
  const normalizedPath = serverScriptPath.replace(/\\/g, "\\\\");
  const payload = {
    mcpServers: {
      "prompt-optimizer": {
        command: "node",
        args: [normalizedPath]
      }
    }
  };

  switch (client) {
    case "cursor":
      return [
        "// Cursor MCP settings snippet",
        JSON.stringify(payload, null, 2)
      ].join("\n");
    case "claude-desktop":
      return [
        "// Claude Desktop MCP settings snippet",
        JSON.stringify(payload, null, 2)
      ].join("\n");
    case "cline":
      return [
        "// Cline / Roo / Continue style MCP snippet",
        JSON.stringify(payload, null, 2)
      ].join("\n");
    case "generic":
    default:
      return JSON.stringify(payload, null, 2);
  }
}

export function getBundledMcpServerPath(extensionRoot: string): string {
  return path.join(extensionRoot, "dist", "mcpServer.js");
}

export function getMcpForwardingSummary(
  targetModel: TargetModel,
  previewBeforeSend: boolean,
  autoSend: boolean
): string {
  return [
    `targetModel=${targetModel}`,
    `previewBeforeSend=${String(previewBeforeSend)}`,
    `autoSend=${String(autoSend)}`
  ].join(", ");
}
