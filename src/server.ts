import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerTools } from "./core/tools.js";
import type { ClassroomApi } from "./classroom.js";
import { tools } from "./tools.js";

const PACKAGE_NAME = "google-classroom-student-mcp";

/** Read a JSON file, or return undefined when it is missing or unreadable. */
function readJsonFile(file: string): { name?: string; version?: string } | undefined {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return undefined;
  }
}

/**
 * Read the version of this package from its package.json. The file sits in
 * the package root, so we look in the given folder and then walk up. That
 * finds the same file for the source in src and for the compiled code in
 * build/src, which is the folder that ships to npm.
 */
export function readPackageVersion(startDir: string): string {
  let dir = startDir;
  for (;;) {
    const file = join(dir, "package.json");
    const pkg = readJsonFile(file);
    if (pkg?.name === PACKAGE_NAME) {
      if (!pkg.version) throw new Error(`No version in ${file}.`);
      return pkg.version;
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error(`Could not find the package.json for ${PACKAGE_NAME}.`);
}

/**
 * The version comes from package.json, so the number the server prints and
 * the number it sends in the MCP handshake can never drift from the package.
 */
export const VERSION: string = readPackageVersion(dirname(fileURLToPath(import.meta.url)));

export function createServer(api: ClassroomApi): McpServer {
  const server = new McpServer({ name: PACKAGE_NAME, version: VERSION });
  registerTools(server, tools, api);
  return server;
}
