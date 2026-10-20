import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { tools } from "../src/tools.js";

const expected = new Map(tools.map((t) => [t.name, t.description]));

function llmsToolLines(): Map<string, string> {
  const text = readFileSync(new URL("../llms.txt", import.meta.url), "utf8");
  const section = text.split(/^## /m).find((s) => s.startsWith("Tools"));
  expect(section, "llms.txt has no Tools section").toBeDefined();
  const out = new Map<string, string>();
  for (const line of section!.split("\n")) {
    const m = line.match(/^- ([a-z_]+): (.+)$/);
    if (m) out.set(m[1], m[2].trim());
  }
  return out;
}

function glamaTools(): { name: string; description: string }[] {
  const json = JSON.parse(readFileSync(new URL("../glama.json", import.meta.url), "utf8"));
  expect(Array.isArray(json.tools), "glama.json has no tools array").toBe(true);
  return json.tools;
}

describe("llms.txt and glama.json stay in lockstep with the tool definitions", () => {
  it("lists exactly the same tool names as src/tools.ts", () => {
    const listed = [...llmsToolLines().keys()];
    expect(listed.sort()).toEqual([...expected.keys()].sort());
    expect(glamaTools().map((t) => t.name).sort()).toEqual([...expected.keys()].sort());
  });

  it("uses the exact tool descriptions from src/tools.ts in llms.txt", () => {
    for (const [name, description] of llmsToolLines()) {
      expect(description, `llms.txt description for ${name}`).toBe(expected.get(name));
    }
  });

  it("uses the exact tool descriptions from src/tools.ts in glama.json", () => {
    for (const t of glamaTools()) {
      expect(t.description, `glama.json description for ${t.name}`).toBe(expected.get(t.name));
    }
  });
});
