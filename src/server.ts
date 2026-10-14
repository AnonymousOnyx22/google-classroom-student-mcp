import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerTools } from "./core/tools.js";
import type { ClassroomApi } from "./classroom.js";
import { tools } from "./tools.js";

export const VERSION = "0.1.0";

export function createServer(api: ClassroomApi): McpServer {
  const server = new McpServer({ name: "google-classroom-student-mcp", version: VERSION });
  registerTools(server, tools, api);
  return server;
}
