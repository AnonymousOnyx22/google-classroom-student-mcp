import { describe, it, expect } from "vitest";
import { setupConfig, setupText } from "../src/setup.js";

const VALUES = {
  GOOGLE_CLIENT_ID: "id-from-google",
  GOOGLE_CLIENT_SECRET: "secret-from-google",
  GOOGLE_REFRESH_TOKEN: "refresh-from-login",
};

/** Every JSON object in the setup text, parsed back. */
function jsonBlocks(text: string): any[] {
  const out: any[] = [];
  let start = text.indexOf("{");
  while (start !== -1) {
    let depth = 0;
    let inString = false;
    let escaped = false;
    let end = start;
    for (; end < text.length; end++) {
      const c = text[end];
      if (inString) {
        if (escaped) escaped = false;
        else if (c === "\\") escaped = true;
        else if (c === '"') inString = false;
      } else if (c === '"') inString = true;
      else if (c === "{") depth++;
      else if (c === "}") {
        depth--;
        if (depth === 0) {
          end++;
          break;
        }
      }
    }
    out.push(JSON.parse(text.slice(start, end)));
    start = text.indexOf("{", end);
  }
  return out;
}

describe("setup prints a config that runs this package", () => {
  it("prints one valid mcpServers block for each app", () => {
    const text = setupText({});
    for (const app of ["Claude Desktop", "Claude Code", "Cursor"]) {
      expect(text, `setup has no ${app} heading`).toContain(app);
    }
    const blocks = jsonBlocks(text);
    expect(blocks.length).toBe(3);
    for (const block of blocks) {
      expect(block.mcpServers.classroom.command).toBe("npx");
      expect(block.mcpServers.classroom.args).toEqual(["-y", "google-classroom-student-mcp"]);
    }
  });

  it("gives the file to paste each block into", () => {
    const text = setupText({});
    expect(text).toContain("claude_desktop_config.json");
    expect(text).toContain(".mcp.json");
    expect(text).toContain(".cursor/mcp.json");
  });

  it("leaves placeholders when the environment has no values", () => {
    const env = setupConfig({}).mcpServers.classroom.env;
    expect(env).toEqual({
      GOOGLE_CLIENT_ID: "your-id",
      GOOGLE_CLIENT_SECRET: "your-secret",
      GOOGLE_REFRESH_TOKEN: "paste-from-login",
    });
  });

  it("fills in the values that are already in the environment", () => {
    for (const block of jsonBlocks(setupText(VALUES))) {
      expect(block.mcpServers.classroom.env).toEqual(VALUES);
    }
  });

  it("fills in the values one at a time", () => {
    const env = setupConfig({ GOOGLE_CLIENT_ID: "only-the-id" }).mcpServers.classroom.env;
    expect(env).toEqual({
      GOOGLE_CLIENT_ID: "only-the-id",
      GOOGLE_CLIENT_SECRET: "your-secret",
      GOOGLE_REFRESH_TOKEN: "paste-from-login",
    });
  });
});
