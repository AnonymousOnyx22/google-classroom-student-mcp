import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer, readPackageVersion, VERSION } from "../src/server.js";
import type { ClassroomApi } from "../src/classroom.js";

const rootDir = fileURLToPath(new URL("../", import.meta.url));

function readRootJson(name: string): any {
  return JSON.parse(readFileSync(new URL(`../${name}`, import.meta.url), "utf8"));
}

describe("the version comes from package.json", () => {
  it("is the version in package.json", () => {
    expect(VERSION).toBe(readRootJson("package.json").version);
  });

  it("is the version the registry lists in server.json", () => {
    const server = readRootJson("server.json");
    expect(server.version).toBe(VERSION);
    for (const pkg of server.packages) expect(pkg.version).toBe(VERSION);
  });

  it("finds the same package.json from the folder that ships to npm", () => {
    expect(readPackageVersion(join(rootDir, "build", "src"))).toBe(VERSION);
    expect(readPackageVersion(join(rootDir, "src"))).toBe(VERSION);
  });

  it("is sent in the MCP handshake", async () => {
    const server = createServer({} as ClassroomApi);
    const [a, b] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "test", version: "0" });
    await Promise.all([server.connect(a), client.connect(b)]);
    const info = client.getServerVersion();
    expect(info?.name).toBe("google-classroom-student-mcp");
    expect(info?.version).toBe(VERSION);
    await client.close();
  });
});
