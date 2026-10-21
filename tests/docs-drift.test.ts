import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { tools } from "../src/tools.js";

const expected = tools.map((t) => ({ name: t.name, description: t.description }));
const expectedNames = expected.map((t) => t.name);

/** Optional arguments that llms.txt talks about in its note under the tool list. */
const NOTED_PARAMS = ["course_ids", "days_ahead"];

/** One tool line in llms.txt, for example "- get_todo: What is left to turn in." */
const TOOL_LINE = /^- ([a-z0-9_]+): (.*)$/;

/** A markdown link to llms.txt in the README, for example "[llms.txt](./llms.txt)". */
const LLMS_LINK = /\]\(\s*\.?\/?llms\.txt\s*\)/;

function readRootFile(name: string): string {
  return readFileSync(new URL(`../${name}`, import.meta.url), "utf8");
}

function toolsSection(file: string): string {
  const section = readRootFile(file).split(/^## /m).find((s) => s.startsWith("Tools"));
  expect(section, `${file} has no Tools section`).toBeDefined();
  return section!;
}

function llmsEntries(): { name: string; description: string }[] {
  const out: { name: string; description: string }[] = [];
  for (const raw of toolsSection("llms.txt").split("\n")) {
    const line = raw.endsWith("\r") ? raw.slice(0, -1) : raw;
    const m = line.match(TOOL_LINE);
    if (m) out.push({ name: m[1], description: m[2] });
  }
  return out;
}

function glamaEntries(): { name: string; description: string }[] {
  const json = JSON.parse(readRootFile("glama.json"));
  expect(Array.isArray(json.tools), "glama.json has no tools array").toBe(true);
  return json.tools;
}

/** The prose under the tool list in llms.txt, where the optional arguments are described. */
function llmsNote(): string {
  return toolsSection("llms.txt")
    .split("\n")
    .filter((line) => !TOOL_LINE.test(line))
    .join("\n");
}

/** The prose under the tool table in README.md, where the optional arguments are described. */
function readmeNote(): string {
  return toolsSection("README.md")
    .split("\n")
    .filter((line) => !line.trim().startsWith("|"))
    .filter((line) => !line.trim().startsWith("#"))
    .join("\n");
}

function namesIn(text: string): string[] {
  return expectedNames.filter((name) => new RegExp(`\\b${name}\\b`).test(text));
}

/** Tools a note says take the given optional argument. */
function notedToolsIn(note: string, param: string): string[] {
  const claims = new Set<string>();
  for (const sentence of note.split(/(?<=[.!?])\s+/)) {
    if (!sentence.includes(param)) continue;
    for (const name of namesIn(sentence)) claims.add(name);
  }
  return [...claims];
}

/** Tools the llms.txt note says take the given optional argument. */
function notedTools(param: string): string[] {
  return notedToolsIn(llmsNote(), param);
}

/** Tools that really take the given argument. */
function toolsWithParam(param: string): string[] {
  return tools.filter((t) => Object.hasOwn(t.inputSchema, param)).map((t) => t.name);
}

describe("llms.txt and glama.json stay in lockstep with the tool definitions", () => {
  it("lists every tool from src/tools.ts in llms.txt, once and in the same order", () => {
    expect(llmsEntries().map((t) => t.name)).toEqual(expectedNames);
  });

  it("lists every tool from src/tools.ts in glama.json, once and in the same order", () => {
    expect(glamaEntries().map((t) => t.name)).toEqual(expectedNames);
  });

  it("uses the exact tool descriptions from src/tools.ts in llms.txt", () => {
    const listed = llmsEntries();
    for (const tool of expected) {
      const found = listed.find((t) => t.name === tool.name);
      expect(found?.description, `llms.txt description for ${tool.name}`).toBe(tool.description);
    }
  });

  it("uses the exact tool descriptions from src/tools.ts in glama.json", () => {
    const listed = glamaEntries();
    for (const tool of expected) {
      const found = listed.find((t) => t.name === tool.name);
      expect(found?.description, `glama.json description for ${tool.name}`).toBe(tool.description);
    }
  });

  it("gives a real example ask in every tool description", () => {
    for (const tool of expected) {
      const examples = tool.description.match(/'[^']+\?'/g) ?? [];
      expect(examples.length, `example asks in the description for ${tool.name}`).toBeGreaterThanOrEqual(1);
      expect(tool.description, `description for ${tool.name}`).toContain("Use this when the user asks");
    }
  });

  it("names the right tools for the optional arguments in the llms.txt note", () => {
    for (const param of NOTED_PARAMS) {
      expect(notedTools(param).sort(), `llms.txt note about ${param}`).toEqual(toolsWithParam(param).sort());
    }
  });

  it("names the right tools for the optional arguments in the README", () => {
    for (const param of NOTED_PARAMS) {
      expect(notedToolsIn(readmeNote(), param).sort(), `README note about ${param}`).toEqual(toolsWithParam(param).sort());
    }
  });
});

describe("the README points at llms.txt", () => {
  it("has a link to llms.txt so site indexes find the plain text tool list", () => {
    expect(readRootFile("README.md")).toMatch(LLMS_LINK);
  });
});
